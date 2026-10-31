import logging
from datetime import date, timedelta

from sqlalchemy.exc import IntegrityError

from app.models.subscription import Subscription, RenewalReminderLog
from app.models.activity import ActivityLog
from app.services.email_service import send_renewal_reminder_email

logger = logging.getLogger(__name__)


def prepare_renewal_reminders(db, *, days: int = 30, subscription_ids=None):
    days = max(1, min(int(days), 365))
    today = date.today()
    cutoff = today + timedelta(days=days)
    query = db.query(Subscription.id).filter(
        Subscription.status == "active", Subscription.end_date >= today,
        Subscription.end_date <= cutoff)
    if subscription_ids is not None:
        query = query.filter(Subscription.id.in_(subscription_ids))
    ids = [row[0] for row in query.order_by(Subscription.end_date).all()]
    created = sent = skipped = failed = 0
    for subscription_id in ids:
        try:
            sub = db.query(Subscription).filter(Subscription.id == subscription_id).with_for_update().first()
            if not sub or sub.status != "active" or not sub.end_date or sub.end_date < today or sub.end_date > cutoff:
                db.rollback()
                skipped += 1
                continue
            existing = db.query(RenewalReminderLog.id).filter(
                RenewalReminderLog.subscription_id == sub.id,
                RenewalReminderLog.subscription_end_date == sub.end_date).first()
            if existing:
                db.rollback()
                skipped += 1
                continue
            if not sub.customer or not sub.customer.email:
                db.rollback()
                skipped += 1
                continue
            if not send_renewal_reminder_email(sub.customer.email, sub):
                db.rollback()
                failed += 1
                continue
            db.add(RenewalReminderLog(subscription_id=sub.id, subscription_end_date=sub.end_date))
            db.add(ActivityLog(action="renewal_reminder_sent", entity_type="subscription", entity_id=sub.id,
                description=f"Renewal reminder sent for {sub.subscription_number}"))
            db.commit()
            created += 1
            sent += 1
        except IntegrityError:
            db.rollback()
            skipped += 1
        except Exception:
            logger.exception("Renewal reminder delivery failed for subscription %s", subscription_id)
            db.rollback()
            failed += 1
    return {"prepared": len(ids), "sent": sent, "skipped": skipped, "failed": failed}
