"""Allowlisted database tools for the assistant; never accepts SQL from a model."""

from datetime import date, timedelta
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import User
from app.models.customer import Customer
from app.services.analytics_service import monthly_recurring_revenue
from app.services.billing_service import preview_due_invoices

TOOL_NAMES = {
    "get_mrr", "get_revenue", "get_active_subscriptions", "get_expiring_subscriptions",
    "get_overdue_invoices", "get_customer_balance", "get_revenue_by_plan",
    "generate_due_invoice_preview", "prepare_renewal_reminders", "get_revenue_summary",
    "get_outstanding_by_customer", "get_subscriptions_due_for_billing", "create_invoice_drafts",
}


def execute_tool(db: Session, user: User, name: str, arguments: dict | None = None):
    arguments = arguments or {}
    if name not in TOOL_NAMES:
        raise HTTPException(400, "Unsupported assistant tool")
    own_customer = user.role == "customer"
    if name in {"get_mrr", "get_revenue_by_plan", "generate_due_invoice_preview", "prepare_renewal_reminders",
                "get_revenue_summary", "get_outstanding_by_customer", "get_subscriptions_due_for_billing", "create_invoice_drafts"} and own_customer:
        raise HTTPException(403, "This assistant tool is for staff users")
    if name == "get_mrr":
        return monthly_recurring_revenue(db)
    if name == "get_revenue_summary":
        today = date.today()
        month_start = today.replace(day=1)
        mrr = Decimal(monthly_recurring_revenue(db)["mrr"])
        collected = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.status == "completed", Payment.payment_date >= month_start).scalar() or 0
        outstanding = db.query(func.coalesce(func.sum(Invoice.balance_due), 0)).filter(
            Invoice.status.in_(["open", "sent", "partial", "confirmed"]), Invoice.balance_due > 0).scalar() or 0
        overdue = db.query(func.coalesce(func.sum(Invoice.balance_due), 0)).filter(
            Invoice.status.in_(["open", "sent", "partial", "confirmed"]), Invoice.balance_due > 0,
            Invoice.due_date < today).scalar() or 0
        active = db.query(func.count(Subscription.id)).filter(Subscription.status == "active").scalar() or 0
        return {"mrr": str(mrr), "active_subscriptions": int(active), "collected_this_month": str(collected),
            "outstanding": str(outstanding), "overdue": str(overdue)}
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
        rows = q.options(joinedload(Subscription.customer)).order_by(Subscription.end_date).all()
        return {"items": [{"id": str(s.id), "number": s.subscription_number, "subscription_id": str(s.id),
            "customer_name": s.customer.name if s.customer else "", "customer_email": s.customer.email if s.customer else "",
            "end_date": s.end_date.isoformat()} for s in rows]}
    if name == "get_overdue_invoices":
        q = db.query(Invoice).filter(Invoice.due_date < date.today(), Invoice.balance_due > 0, Invoice.status.notin_(["cancelled", "canceled"]))
        if own_customer:
            q = q.filter(Invoice.customer_id == user.customer_id)
        rows = q.options(joinedload(Invoice.customer)).order_by(Invoice.due_date).all()
        return {"items": [{"id": str(i.id), "invoice_id": str(i.id), "number": i.invoice_number,
            "invoice_number": i.invoice_number, "customer_name": i.customer.name if i.customer else "",
            "due_date": i.due_date.isoformat(), "days_overdue": (date.today() - i.due_date).days,
            "balance": str(i.balance_due), "balance_due": str(i.balance_due)} for i in rows]}
    if name == "get_customer_balance":
        customer_id = arguments.get("customer_id")
        if own_customer:
            customer_id = str(user.customer_id)
        if not customer_id:
            raise HTTPException(422, "customer_id is required")
        total = db.query(func.coalesce(func.sum(Invoice.balance_due), 0)).filter(Invoice.customer_id == customer_id, Invoice.status.notin_(["cancelled", "canceled"])).scalar()
        return {"customer_id": customer_id, "balance_due": str(total or 0)}
    if name == "get_revenue_by_plan":
        rows = db.query(Plan.name, func.coalesce(func.sum(Payment.amount), 0)).join(
            SubscriptionLine, SubscriptionLine.plan_id == Plan.id).join(Subscription,
            Subscription.id == SubscriptionLine.subscription_id).join(Invoice, Invoice.subscription_id == Subscription.id).join(
            Payment, Payment.invoice_id == Invoice.id).filter(Payment.status == "completed").group_by(Plan.name).all()
        return {"items": [{"plan": plan, "value": str(total or 0)} for plan, total in rows]}
    if name == "get_outstanding_by_customer":
        overdue_case = case((Invoice.due_date < date.today(), Invoice.balance_due), else_=0)
        rows = db.query(Customer.id, Customer.name, func.sum(Invoice.balance_due), func.sum(overdue_case),
                func.count(Invoice.id)).join(Invoice, Invoice.customer_id == Customer.id).filter(
                Invoice.status.in_(["open", "sent", "partial", "confirmed"]), Invoice.balance_due > 0)
        if own_customer:
            rows = rows.filter(Customer.id == user.customer_id)
        rows = rows.group_by(Customer.id, Customer.name).order_by(func.sum(Invoice.balance_due).desc()).all()
        return {"items": [{"id": str(cid), "customer_name": name, "balance": str(balance or 0),
            "overdue": str(overdue or 0), "invoices": int(count)} for cid, name, balance, overdue, count in rows]}
    if name == "generate_due_invoice_preview":
        return {"items": preview_due_invoices(db)}
    if name == "get_subscriptions_due_for_billing":
        return {"items": preview_due_invoices(db)}
    if name == "create_invoice_drafts":
        if not arguments.get("dry_run", True):
            raise HTTPException(403, "Invoice drafts require administrator approval")
        return {"items": preview_due_invoices(db)}
    if name == "prepare_renewal_reminders":
        days = max(1, min(int(arguments.get("days", 30)), 365))
        q = db.query(Subscription).options(joinedload(Subscription.customer), joinedload(Subscription.lines).joinedload(SubscriptionLine.plan)).filter(Subscription.status == "active", Subscription.end_date.is_not(None), Subscription.end_date <= date.today() + timedelta(days=days), Subscription.end_date >= date.today())
        rows = q.order_by(Subscription.end_date).all()
        return {"prepared": [{"customer_id": str(s.customer_id), "subscription_id": str(s.id),
            "subscription_number": s.subscription_number, "customer_name": s.customer.name if s.customer else "",
            "customer_email": s.customer.email if s.customer else "", "plan_name": next((line.plan.name for line in s.lines if line.plan), ""),
            "end_date": s.end_date.isoformat()} for s in rows], "sent": False, "approval_required_to_send": True}
