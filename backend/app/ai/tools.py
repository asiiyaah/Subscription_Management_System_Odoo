"""Allowlisted database tools for the assistant; never accepts SQL from a model."""

from datetime import date, timedelta
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import User
from app.services.analytics_service import monthly_recurring_revenue
from app.services.billing_service import preview_due_invoices

TOOL_NAMES = {
    "get_mrr", "get_revenue", "get_active_subscriptions", "get_expiring_subscriptions",
    "get_overdue_invoices", "get_customer_balance", "get_revenue_by_plan",
    "generate_due_invoice_preview", "prepare_renewal_reminders",
}


def execute_tool(db: Session, user: User, name: str, arguments: dict | None = None):
    arguments = arguments or {}
    if name not in TOOL_NAMES:
        raise HTTPException(400, "Unsupported assistant tool")
    own_customer = user.role == "customer"
    if name in {"get_mrr", "get_revenue_by_plan", "generate_due_invoice_preview", "prepare_renewal_reminders"} and own_customer:
        raise HTTPException(403, "This assistant tool is for staff users")
    if name == "get_mrr":
        return monthly_recurring_revenue(db)
    if name == "get_revenue":
        start = arguments.get("start_date")
        end = arguments.get("end_date")
        q = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(Payment.status == "completed")
        if start:
            q = q.filter(Payment.payment_date >= date.fromisoformat(start))
        if end:
            q = q.filter(Payment.payment_date < date.fromisoformat(end) + timedelta(days=1))
        if own_customer:
            q = q.filter(Payment.customer_id == user.customer_id)
        return {"revenue": str(q.scalar() or 0), "start_date": start, "end_date": end}
    if name == "get_active_subscriptions":
        q = db.query(Subscription).filter(Subscription.status == "active")
        if own_customer:
            q = q.filter(Subscription.customer_id == user.customer_id)
        rows = q.all()
        return {"count": len(rows), "subscriptions": [{"number": s.subscription_number, "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None} for s in rows]}
    if name == "get_expiring_subscriptions":
        days = max(1, min(int(arguments.get("days", 30)), 365))
        q = db.query(Subscription).filter(Subscription.status == "active", Subscription.end_date.is_not(None), Subscription.end_date <= date.today() + timedelta(days=days), Subscription.end_date >= date.today())
        if own_customer:
            q = q.filter(Subscription.customer_id == user.customer_id)
        return {"items": [{"number": s.subscription_number, "end_date": s.end_date.isoformat()} for s in q.order_by(Subscription.end_date).all()]}
    if name == "get_overdue_invoices":
        q = db.query(Invoice).filter(Invoice.due_date < date.today(), Invoice.balance_due > 0, Invoice.status.notin_(["cancelled", "canceled"]))
        if own_customer:
            q = q.filter(Invoice.customer_id == user.customer_id)
        return {"items": [{"invoice_number": i.invoice_number, "due_date": i.due_date.isoformat(), "balance_due": str(i.balance_due)} for i in q.order_by(Invoice.due_date).all()]}
    if name == "get_customer_balance":
        customer_id = arguments.get("customer_id")
        if own_customer:
            customer_id = str(user.customer_id)
        if not customer_id:
            raise HTTPException(422, "customer_id is required")
        total = db.query(func.coalesce(func.sum(Invoice.balance_due), 0)).filter(Invoice.customer_id == customer_id, Invoice.status.notin_(["cancelled", "canceled"])).scalar()
        return {"customer_id": customer_id, "balance_due": str(total or 0)}
    if name == "get_revenue_by_plan":
        rows = db.query(Plan.name, func.sum(SubscriptionLine.line_total)).join(SubscriptionLine, SubscriptionLine.plan_id == Plan.id).join(Subscription, Subscription.id == SubscriptionLine.subscription_id).filter(Subscription.status == "active").group_by(Plan.name).all()
        return {"items": [{"plan": name, "value": str(total or 0)} for name, total in rows]}
    if name == "generate_due_invoice_preview":
        return {"items": preview_due_invoices(db)}
    if name == "prepare_renewal_reminders":
        days = max(1, min(int(arguments.get("days", 30)), 365))
        q = db.query(Subscription).filter(Subscription.status == "active", Subscription.end_date.is_not(None), Subscription.end_date <= date.today() + timedelta(days=days), Subscription.end_date >= date.today())
        return {"prepared": [{"customer_id": str(s.customer_id), "subscription_id": str(s.id), "end_date": s.end_date.isoformat()} for s in q.all()], "sent": False, "approval_required_to_send": True}
