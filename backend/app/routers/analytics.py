from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.database.connection import get_db
from app.models.activity import ActivityLog
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import User

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _monthly_amount(amount, period, interval=1):
    amount = Decimal(str(amount or 0))
    n = max(int(interval or 1), 1)
    return {"daily": amount * Decimal(365) / Decimal(12 * n), "weekly": amount * Decimal(52) / Decimal(12 * n),
            "monthly": amount / n, "yearly": amount / Decimal(12 * n)}.get((period or "monthly").lower(), amount)


@router.get("/summary")
def dashboard_summary(db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    active = db.query(Subscription).filter(Subscription.status == "active").all()
    invoices = db.query(Invoice).all()
    collected = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(Payment.status == "completed").scalar()
    status_rows = db.query(Subscription.status, func.count(Subscription.id)).group_by(Subscription.status).all()
    return {"active_subscriptions": len(active), "mrr": str(sum((_monthly_amount(s.total, s.billing_period, s.billing_interval) for s in active), Decimal(0))),
        "revenue_collected": str(collected or 0), "outstanding_amount": str(sum((i.balance_due or 0 for i in invoices), Decimal(0))),
        "overdue_invoice_count": sum(i.due_date < date.today() and (i.balance_due or 0) > 0 and i.status not in {"cancelled", "canceled"} for i in invoices),
        "subscription_status_breakdown": {status: count for status, count in status_rows}}


@router.get("/revenue-over-time")
def revenue_over_time(start_date: date | None = None, end_date: date | None = None, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    end = end_date or date.today()
    start = start_date or end - timedelta(days=180)
    rows = db.query(Payment.payment_date, Payment.amount).filter(Payment.status == "completed", Payment.payment_date >= start, Payment.payment_date < end + timedelta(days=1)).order_by(Payment.payment_date).all()
    totals = {}
    for when, amount in rows:
        month = when.strftime("%Y-%m")
        totals[month] = totals.get(month, Decimal(0)) + Decimal(str(amount))
    return {"start_date": start.isoformat(), "end_date": end.isoformat(), "items": [{"period": k, "revenue": str(v)} for k, v in sorted(totals.items())]}


@router.get("/revenue-by-plan")
def revenue_by_plan(db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    rows = db.query(Plan.name, Subscription.billing_period, Subscription.billing_interval, SubscriptionLine.unit_price, SubscriptionLine.quantity).join(SubscriptionLine, SubscriptionLine.plan_id == Plan.id).join(Subscription, Subscription.id == SubscriptionLine.subscription_id).filter(Subscription.status == "active").all()
    result = {}
    for name, period, interval, price, qty in rows:
        result[name] = result.get(name, Decimal(0)) + _monthly_amount(Decimal(str(price)) * Decimal(str(qty or 1)), period, interval)
    return {"items": [{"plan": name, "mrr": str(value)} for name, value in sorted(result.items())]}


@router.get("/expiring-subscriptions")
def expiring_subscriptions(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    cutoff = date.today() + timedelta(days=days)
    rows = db.query(Subscription).filter(Subscription.status == "active", Subscription.end_date.is_not(None), Subscription.end_date <= cutoff, Subscription.end_date >= date.today()).order_by(Subscription.end_date).all()
    return {"items": [{"id": str(s.id), "subscription_number": s.subscription_number, "customer_id": str(s.customer_id), "end_date": s.end_date.isoformat()} for s in rows]}


@router.get("/recent-activity")
def recent_activity(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    rows = db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return {"items": [{"id": str(x.id), "action": x.action, "entity_type": x.entity_type, "entity_id": str(x.entity_id) if x.entity_id else None, "description": x.description, "created_at": x.created_at.isoformat() if x.created_at else None} for x in rows]}
