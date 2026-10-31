import logging
from datetime import date, datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import selectinload, joinedload

from app.core.config import settings
from app.database.connection import SessionLocal
from app.models.subscription import Subscription, SubscriptionLine
from app.models.settings import BusinessSetting
from app.models.ai import AIActionApproval
from app.services.billing_service import generate_due_invoices
from app.services.subscription_service import transition_subscription
from app.services.reminder_service import prepare_renewal_reminders

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
            logger.info("Scheduled reminder result: %s", prepare_renewal_reminders(db, days=30))
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


def start_scheduler():
    if not settings.ENABLE_AUTOMATION:
        return
    scheduler.add_job(generate_invoices_job, "interval", hours=1, id="generate_due_invoices", replace_existing=True)
    scheduler.add_job(close_expired_job, "cron", hour=1, id="close_expired_subscriptions", replace_existing=True)
    scheduler.add_job(renewal_reminders_job, "cron", hour=9, id="renewal_reminders", replace_existing=True)
    if scheduler.get_jobs():
        scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
