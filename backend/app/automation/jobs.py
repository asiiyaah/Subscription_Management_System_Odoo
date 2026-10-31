import logging
from datetime import date, datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import selectinload, joinedload

from app.core.config import settings
from app.database.connection import SessionLocal
from app.models.subscription import Subscription, SubscriptionLine
from app.models.settings import BusinessSetting
from app.models.ai import AIActionApproval
from app.models.invoice import Invoice
from app.services.billing_service import generate_due_invoices
from app.services.subscription_service import transition_subscription
from app.services.reminder_service import prepare_renewal_reminders
from app.services.email_service import send_overdue_invoice_reminder_email
from app.services.activity_service import log_activity

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone="UTC")


def generate_invoices_job():
    db = SessionLocal()
    try:
        prefs = db.query(BusinessSetting).first()
        if not settings.AUTO_GENERATE_DUE_INVOICES and not (prefs and prefs.auto_generate_invoices):
            return
        logger.info("Due invoice automation result: %s", generate_due_invoices(db))
    except Exception:
        logger.exception("Due invoice automation failed")
        db.rollback()
    finally:
        db.close()


def close_expired_job():
    db = SessionLocal()
    try:
        prefs = db.query(BusinessSetting).first()
        global_close = settings.AUTO_CLOSE_EXPIRED_SUBSCRIPTIONS or bool(prefs and prefs.auto_close_expired)
        today = date.today()
        rows = (db.query(Subscription).options(selectinload(Subscription.lines).joinedload(SubscriptionLine.plan))
            .filter(Subscription.status.in_(["active", "paused"]), Subscription.end_date < today).all())
        for sub in rows:
            if not global_close and (not sub.lines or any(not line.plan or not line.plan.auto_close for line in sub.lines)):
                continue
            transition_subscription(db, sub, "closed", action="automatic_expiry", notes="Subscription end date passed")
        db.commit()
        logger.info("Closed %s expired subscriptions", len(rows))
    except Exception:
        logger.exception("Expired subscription automation failed")
        db.rollback()
    finally:
        db.close()


def renewal_reminders_job():
    db = SessionLocal()
    try:
        prefs = db.query(BusinessSetting).first()
        if prefs and prefs.send_renewal_reminders:
            logger.info("Scheduled reminder result: %s", prepare_renewal_reminders(db, days=prefs.renewal_reminder_days or 30))
        pending = db.query(AIActionApproval).filter(AIActionApproval.action_type == "send_renewal_reminders",
            AIActionApproval.status == "approved", AIActionApproval.executed_at.is_(None)).all()
        for approval in pending:
            result = prepare_renewal_reminders(db, days=int((approval.action_payload or {}).get("days", 30)))
            if not result["failed"]:
                approval.executed_at = datetime.now(timezone.utc)
                db.commit()
    except Exception:
        logger.exception("Renewal reminder automation failed")
        db.rollback()
    finally:
        db.close()


def overdue_reminders_job():
    db = SessionLocal()
    try:
        prefs = db.query(BusinessSetting).first()
        interval = max(1, int(prefs.overdue_reminder_days if prefs else 7))
        today = date.today()
        rows = (db.query(Invoice).options(joinedload(Invoice.customer))
            .filter(Invoice.status.in_(["open", "sent", "partial", "confirmed"]),
                Invoice.due_date < today, Invoice.balance_due > 0).all())
        sent = failed = skipped = 0
        for invoice in rows:
            days_overdue = (today - invoice.due_date).days
            if days_overdue % interval:
                continue
            if not invoice.customer or not invoice.customer.email:
                skipped += 1
                continue
            try:
                if not send_overdue_invoice_reminder_email(invoice.customer.email, invoice):
                    skipped += 1
                    continue
                log_activity(db, action="overdue_invoice_reminder_sent", entity_type="invoice",
                    entity_id=invoice.id, description=f"Sent overdue reminder for {invoice.invoice_number}")
                db.commit()
                sent += 1
            except Exception:
                logger.exception("Overdue reminder delivery failed for invoice %s", invoice.invoice_number)
                db.rollback()
                failed += 1
        logger.info("Overdue reminder result: sent=%s failed=%s skipped=%s", sent, failed, skipped)
    except Exception:
        logger.exception("Overdue reminder job failed")
        db.rollback()
    finally:
        db.close()


def start_scheduler():
    if not settings.ENABLE_AUTOMATION:
        return
    if scheduler.running:
        return
    db = SessionLocal()
    try:
        prefs = db.query(BusinessSetting).first()
        invoice_time = prefs.invoice_run_time if prefs and prefs.invoice_run_time else datetime.min.time()
    finally:
        db.close()
    job_options = {"replace_existing": True, "max_instances": 1, "coalesce": True, "misfire_grace_time": 3600}
    scheduler.add_job(generate_invoices_job, "cron", hour=invoice_time.hour, minute=invoice_time.minute,
        id="generate_due_invoices", **job_options)
    scheduler.add_job(close_expired_job, "cron", hour=1, id="close_expired_subscriptions", **job_options)
    scheduler.add_job(renewal_reminders_job, "cron", hour=9, id="renewal_reminders", **job_options)
    scheduler.add_job(overdue_reminders_job, "cron", hour=10, id="overdue_invoice_reminders", **job_options)
    if scheduler.get_jobs() and not scheduler.running:
        scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
