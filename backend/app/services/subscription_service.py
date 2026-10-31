from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.subscription import Subscription, SubscriptionHistory

VALID_TRANSITIONS = {
    "draft": {"quotation", "confirmed", "closed"},
    "quotation": {"confirmed", "closed"},
    "confirmed": {"active", "closed"},
    "active": {"paused", "closed"},
    "paused": {"active", "closed"},
    "closed": set(),
}


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(value.day, monthrange(year, month)[1]))


def next_billing_date(value: date, period: str, interval: int = 1) -> date:
    period = period.lower()
    if interval < 1:
        raise ValueError("Billing interval must be at least one")
    if period == "daily":
        from datetime import timedelta
        return value + timedelta(days=interval)
    if period == "weekly":
        from datetime import timedelta
        return value + timedelta(weeks=interval)
    if period == "monthly":
        return add_months(value, interval)
    if period == "yearly":
        return add_months(value, 12 * interval)
    raise ValueError("Unsupported billing period")


def transition_subscription(db: Session, subscription: Subscription, new_status: str, *, user_id=None, action: str | None = None, notes: str | None = None):
    if new_status not in VALID_TRANSITIONS.get(subscription.status, set()):
        raise HTTPException(409, f"Cannot transition subscription from {subscription.status} to {new_status}")
    if new_status == "paused" and any(line.plan and not line.plan.is_pausable for line in subscription.lines):
        raise HTTPException(409, "The selected plan does not allow pausing")
    if new_status == "closed" and any(line.plan and not line.plan.allows_early_closure for line in subscription.lines):
        if not subscription.end_date or subscription.end_date > date.today():
            raise HTTPException(409, "The selected plan does not allow early closure")
    if new_status == "active" and subscription.status == "paused" and any(line.plan and not line.plan.is_renewable for line in subscription.lines):
        raise HTTPException(409, "The selected plan does not allow resuming")
    old_status = subscription.status
    subscription.status = new_status
    if new_status == "active":
        if not subscription.start_date:
            subscription.start_date = date.today()
        if not subscription.next_billing_date:
            trial_days = max((line.plan.trial_days or 0 for line in subscription.lines if line.plan), default=0)
            if trial_days:
                subscription.next_billing_date = subscription.start_date + timedelta(days=trial_days)
            else:
                subscription.next_billing_date = next_billing_date(
                    subscription.start_date,
                    subscription.billing_period or "monthly",
                    subscription.billing_interval or 1,
                )
    if new_status == "closed":
        subscription.end_date = date.today()
    db.add(SubscriptionHistory(
        subscription_id=subscription.id, previous_status=old_status,
        new_status=new_status, action=action or new_status,
        notes=notes, changed_by=user_id,
    ))
    return subscription


def roll_billing_date(subscription: Subscription, billed_date: date):
    subscription.next_billing_date = next_billing_date(
        billed_date, subscription.billing_period or "monthly", subscription.billing_interval or 1
    )
