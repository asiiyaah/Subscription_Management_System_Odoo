"""Allowlisted database tools for the assistant; never accepts SQL from a model."""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import logging

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import case, func, or_, literal_column
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import User
from app.models.customer import Customer
from app.services.analytics_service import monthly_recurring_revenue
from app.services.billing_service import preview_due_invoices
from app.ai.tool_registry import TOOL_NAMES, validate_tool_arguments

logger = logging.getLogger(__name__)
_MONTH = literal_column("'month'")

_STAFF_ONLY = {"get_business_overview", "get_revenue_summary", "get_monthly_recurring_revenue", "get_mrr",
    "get_revenue_by_month", "get_revenue_by_plan", "get_subscription_statistics", "get_subscription_growth",
    "get_payment_statistics", "get_payment_summary", "get_customers",
    "get_top_customers", "get_outstanding_by_customer", "preview_due_invoices", "generate_due_invoice_preview",
    "get_subscriptions_due_for_billing", "create_invoice_drafts", "preview_renewal_reminders",
    "prepare_renewal_reminders", "preview_overdue_reminders", "prepare_overdue_reminders"}


def execute_tool(db: Session, user: User, name: str, arguments: dict | None = None):
    if name not in TOOL_NAMES:
        raise HTTPException(400, "Unsupported assistant tool")
    try:
        arguments = validate_tool_arguments(name, arguments)
    except ValidationError as exc:
        message = exc.errors()[0].get("msg", "Invalid tool arguments") if exc.errors() else "Invalid tool arguments"
        raise HTTPException(422, f"Invalid arguments for {name}: {message}") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    own_customer = user.role == "customer"
    if own_customer and name in _STAFF_ONLY:
        raise HTTPException(403, "This assistant tool is for staff users")
    if user.role not in {"admin", "staff", "customer"}:
        raise HTTPException(403, "This account cannot use business assistant tools")
    if arguments.get("start_date") and arguments.get("end_date") and arguments["start_date"] > arguments["end_date"]:
        raise HTTPException(422, "start_date must be on or before end_date")

    if name in {"get_business_overview", "get_payment_statistics", "get_payment_summary", "get_subscription_statistics"}:
        if name in {"get_business_overview"}:
            return execute_tool(db, user, "get_revenue_summary", {})
        if name in {"get_payment_statistics", "get_payment_summary"}:
            month_start = date.today().replace(day=1)
            q = db.query(Payment.payment_method, func.coalesce(func.sum(Payment.amount), 0), func.count(Payment.id)).filter(
                Payment.status == "completed", Payment.payment_date >= datetime.combine(month_start, time.min, tzinfo=timezone.utc))
            if own_customer:
                q = q.filter(Payment.customer_id == user.customer_id)
            rows = q.group_by(Payment.payment_method).order_by(func.sum(Payment.amount).desc()).all()
            return {"items": [{"method": (method or "").replace(" ", "_"), "amount": str(amount or 0), "count": int(count)}
                for method, amount, count in rows], "collected_this_month": str(sum((Decimal(str(row[1] or 0)) for row in rows), Decimal("0")))}
        rows = db.query(Subscription.status, func.count(Subscription.id)).group_by(Subscription.status).all()
        counts = {status: int(count) for status, count in rows}
        return {"counts": {status: counts.get(status, 0) for status in ("draft", "quotation", "confirmed", "active", "paused", "closed")}}

    if name == "get_revenue_by_month":
        end_date = arguments.get("end_date") or date.today()
        start_date = arguments.get("start_date") or date(end_date.year, end_date.month, 1)
        if not arguments.get("start_date") and not arguments.get("end_date"):
            for _ in range(5):
                start_date = date(start_date.year - (start_date.month == 1),
                    12 if start_date.month == 1 else start_date.month - 1, 1)
        q = db.query(func.date_trunc(_MONTH, Payment.payment_date), func.coalesce(func.sum(Payment.amount), 0), func.count(Payment.id)).filter(
            Payment.status == "completed", Payment.payment_date >= start_date,
            Payment.payment_date < end_date + timedelta(days=1))
        if own_customer:
            q = q.filter(Payment.customer_id == user.customer_id)
        rows = q.group_by(func.date_trunc(_MONTH, Payment.payment_date)).order_by(func.date_trunc(_MONTH, Payment.payment_date)).all()
        totals = {month.strftime("%Y-%m"): (Decimal(str(amount or 0)), int(count)) for month, amount, count in rows}
        items = []
        cursor, stop = date(start_date.year, start_date.month, 1), date(end_date.year, end_date.month, 1)
        while cursor <= stop:
            key = cursor.strftime("%Y-%m")
            amount, count = totals.get(key, (Decimal("0"), 0))
            items.append({"month": key, "amount": str(amount), "count": count})
            cursor = date(cursor.year + (cursor.month == 12), 1 if cursor.month == 12 else cursor.month + 1, 1)
        return {"items": items}

    if name == "get_subscription_growth":
        months = int(arguments.get("months", 6))
        today = date.today()
        stop = date(today.year, today.month, 1)
        start = stop
        for _ in range(months - 1):
            start = date(start.year - (start.month == 1), 12 if start.month == 1 else start.month - 1, 1)
        next_month = date(today.year + (today.month == 12), 1 if today.month == 12 else today.month + 1, 1)
        q = db.query(func.date_trunc(_MONTH, Subscription.created_at), func.count(Subscription.id)).filter(
            Subscription.created_at >= start, Subscription.created_at < next_month)
        rows = q.group_by(func.date_trunc(_MONTH, Subscription.created_at)).order_by(
            func.date_trunc(_MONTH, Subscription.created_at)).all()
        counts = {month.strftime("%Y-%m"): int(count) for month, count in rows}
        items, cursor = [], start
        while cursor <= stop:
            key = cursor.strftime("%Y-%m")
            items.append({"month": key, "count": counts.get(key, 0)})
            cursor = date(cursor.year + (cursor.month == 12), 1 if cursor.month == 12 else cursor.month + 1, 1)
        return {"items": items}

    if name in {"get_subscriptions", "get_cancelled_subscriptions", "get_active_subscriptions"}:
        q = db.query(Subscription).options(joinedload(Subscription.customer),
            selectinload(Subscription.lines).joinedload(SubscriptionLine.plan))
        if own_customer:
            q = q.filter(Subscription.customer_id == user.customer_id)
        if name == "get_cancelled_subscriptions":
            q = q.filter(Subscription.status.in_(["closed", "cancelled"]))
        elif name == "get_active_subscriptions":
            q = q.filter(Subscription.status == "active")
        elif arguments.get("status"):
            q = q.filter(Subscription.status == arguments["status"])
        if arguments.get("q"):
            like = f"%{arguments['q'].strip()}%"
            q = q.join(Subscription.customer).filter(or_(Subscription.subscription_number.ilike(like), Customer.name.ilike(like)))
        total = q.count()
        rows = q.order_by(Subscription.created_at.desc()).limit(int(arguments.get("limit", 25))).all()
        return {"count": total, "items": [{"id": str(sub.id), "subscription_id": str(sub.id),
            "number": sub.subscription_number, "customer_name": sub.customer.name if sub.customer else "",
            "status": sub.status, "plan_name": next((line.plan.name for line in sub.lines if line.plan), ""),
            "total": str(sub.total or 0), "next_billing_date": sub.next_billing_date.isoformat() if sub.next_billing_date else None,
            "end_date": sub.end_date.isoformat() if sub.end_date else None} for sub in rows]}

    if name == "get_subscription_details":
        q = db.query(Subscription).options(joinedload(Subscription.customer), selectinload(Subscription.lines).joinedload(SubscriptionLine.plan))
        if own_customer:
            q = q.filter(Subscription.customer_id == user.customer_id)
        sub = q.filter(Subscription.id == arguments["subscription_id"]).first()
        if not sub:
            raise HTTPException(404, "Subscription not found")
        return {"id": str(sub.id), "number": sub.subscription_number, "status": sub.status,
            "customer_name": sub.customer.name if sub.customer else "", "total": str(sub.total or 0),
            "billing_period": sub.billing_period, "next_billing_date": sub.next_billing_date.isoformat() if sub.next_billing_date else None,
            "end_date": sub.end_date.isoformat() if sub.end_date else None,
            "lines": [{"plan": line.plan.name if line.plan else "", "description": line.description,
                "quantity": str(line.quantity or 1), "total": str(line.line_total or 0)} for line in sub.lines]}

    if name == "get_invoices":
        q = db.query(Invoice).options(joinedload(Invoice.customer), joinedload(Invoice.subscription))
        if own_customer:
            q = q.filter(Invoice.customer_id == user.customer_id)
        if arguments.get("status"):
            status = arguments["status"]
            if status == "confirmed":
                q = q.filter(Invoice.status.in_(["open", "sent", "partial", "confirmed"]))
            elif status == "cancelled":
                q = q.filter(Invoice.status.in_(["cancelled", "canceled"]))
            else:
                q = q.filter(Invoice.status == status)
        if arguments.get("date_from"):
            q = q.filter(Invoice.invoice_date >= arguments["date_from"])
        if arguments.get("date_to"):
            q = q.filter(Invoice.invoice_date <= arguments["date_to"])
        if arguments.get("q"):
            like = f"%{arguments['q'].strip()}%"
            q = q.filter(or_(Invoice.invoice_number.ilike(like), Invoice.customer.has(Customer.name.ilike(like))))
        rows = q.order_by(Invoice.invoice_date.desc()).limit(int(arguments.get("limit", 25))).all()
        return {"items": [{"id": str(inv.id), "number": inv.invoice_number,
            "customer_name": inv.customer.name if inv.customer else "", "status": inv.status,
            "invoice_date": inv.invoice_date.isoformat(), "due_date": inv.due_date.isoformat(),
            "total": str(inv.total or 0), "balance": str(inv.balance_due or 0)} for inv in rows]}

    if name in {"get_due_invoices", "get_outstanding_payments"}:
        q = db.query(Invoice).options(joinedload(Invoice.customer)).filter(
            Invoice.status.in_(["open", "sent", "partial", "confirmed"]), Invoice.balance_due > 0)
        if own_customer:
            q = q.filter(Invoice.customer_id == user.customer_id)
        if name == "get_due_invoices":
            q = q.filter(Invoice.due_date >= date.today(),
                Invoice.due_date <= date.today() + timedelta(days=int(arguments.get("days", 7))))
        if arguments.get("q"):
            like = f"%{arguments['q'].strip()}%"
            q = q.filter(or_(Invoice.invoice_number.ilike(like), Invoice.customer.has(Customer.name.ilike(like))))
        rows = q.order_by(Invoice.due_date).limit(int(arguments.get("limit", 25))).all()
        return {"items": [{"id": str(inv.id), "number": inv.invoice_number,
            "customer_name": inv.customer.name if inv.customer else "", "due_date": inv.due_date.isoformat(),
            "balance": str(inv.balance_due or 0)} for inv in rows]}

    if name == "get_payments":
        q = db.query(Payment).options(joinedload(Payment.customer), joinedload(Payment.invoice))
        if own_customer:
            q = q.filter(Payment.customer_id == user.customer_id)
        if arguments.get("status"):
            q = q.filter(Payment.status == arguments["status"])
        if arguments.get("method"):
            q = q.filter(func.lower(Payment.payment_method) == arguments["method"].replace("_", " "))
        if arguments.get("date_from"):
            q = q.filter(Payment.payment_date >= arguments["date_from"])
        if arguments.get("date_to"):
            q = q.filter(Payment.payment_date < arguments["date_to"] + timedelta(days=1))
        if arguments.get("q"):
            like = f"%{arguments['q'].strip()}%"
            q = q.join(Payment.customer).join(Payment.invoice).filter(or_(Payment.payment_reference.ilike(like),
                Payment.note.ilike(like), Customer.name.ilike(like), Invoice.invoice_number.ilike(like)))
        rows = q.order_by(Payment.payment_date.desc()).limit(int(arguments.get("limit", 25))).all()
        return {"items": [{"id": str(payment.id), "number": payment.payment_reference or f"PAY-{str(payment.id)[:8].upper()}",
            "payment_date": payment.payment_date.date().isoformat() if payment.payment_date else None,
            "method": (payment.payment_method or "").replace(" ", "_"), "amount": str(payment.amount or 0),
            "customer_name": payment.customer.name if payment.customer else "",
            "invoice_number": payment.invoice.invoice_number if payment.invoice else ""} for payment in rows]}

    if name in {"get_customers", "get_customer_details", "get_top_customers"}:
        if name == "get_customers":
            sub_counts = (db.query(Subscription.customer_id.label("customer_id"),
                func.count(Subscription.id).label("subscriptions")).group_by(Subscription.customer_id).subquery())
            q = db.query(Customer, func.coalesce(sub_counts.c.subscriptions, 0)).outerjoin(
                sub_counts, sub_counts.c.customer_id == Customer.id)
            if arguments.get("q"):
                like = f"%{arguments['q'].strip()}%"
                q = q.filter(or_(Customer.name.ilike(like), Customer.email.ilike(like)))
            rows = q.order_by(Customer.name).limit(int(arguments.get("limit", 25))).all()
            return {"items": [{"id": str(customer.id), "name": customer.name, "email": customer.email,
                "company": customer.company, "active": bool(customer.is_active), "subscriptions": int(count)}
                for customer, count in rows]}
        customer_id = user.customer_id if own_customer else arguments.get("customer_id")
        if name == "get_customer_details":
            if not customer_id:
                raise HTTPException(422, "customer_id is required")
            customer = db.query(Customer).filter(Customer.id == customer_id).first()
            if not customer:
                raise HTTPException(404, "Customer not found")
            sub_count = db.query(func.count(Subscription.id)).filter(Subscription.customer_id == customer.id).scalar() or 0
            invoice_total = db.query(func.coalesce(func.sum(Invoice.total), 0)).filter(
                Invoice.customer_id == customer.id, Invoice.status.notin_(["draft", "cancelled", "canceled"])).scalar() or 0
            balance = db.query(func.coalesce(func.sum(Invoice.balance_due), 0)).filter(
                Invoice.customer_id == customer.id, Invoice.status.in_(["open", "sent", "partial", "confirmed"])).scalar() or 0
            return {"id": str(customer.id), "name": customer.name, "email": customer.email,
                "company": customer.company, "subscriptions": int(sub_count), "invoiced": str(invoice_total), "balance": str(balance)}
        spend_by_customer = (db.query(Payment.customer_id.label("customer_id"), func.sum(Payment.amount).label("spend"))
            .filter(Payment.status == "completed").group_by(Payment.customer_id).subquery())
        subs_by_customer = (db.query(Subscription.customer_id.label("customer_id"),
            func.count(Subscription.id).label("subscriptions")).group_by(Subscription.customer_id).subquery())
        active_value_by_customer = (db.query(Subscription.customer_id.label("customer_id"),
            func.sum(Subscription.total).label("subscription_value")).filter(
                Subscription.status == "active").group_by(Subscription.customer_id).subquery())
        rows = (db.query(Customer.id, Customer.name, func.coalesce(spend_by_customer.c.spend, 0),
                func.coalesce(subs_by_customer.c.subscriptions, 0),
                func.coalesce(active_value_by_customer.c.subscription_value, 0))
            .outerjoin(spend_by_customer, spend_by_customer.c.customer_id == Customer.id)
            .outerjoin(subs_by_customer, subs_by_customer.c.customer_id == Customer.id)
            .outerjoin(active_value_by_customer, active_value_by_customer.c.customer_id == Customer.id)
            .order_by(spend_by_customer.c.spend.desc().nullslast())
            .limit(int(arguments.get("limit", 25))).all())
        return {"items": [{"id": str(cid), "customer_name": customer, "spend": str(spend or 0),
            "subscriptions": int(subscriptions), "subscription_value": str(subscription_value or 0)}
            for cid, customer, spend, subscriptions, subscription_value in rows]}

    if name in {"preview_overdue_reminders", "prepare_overdue_reminders"}:
        q = db.query(Invoice).options(joinedload(Invoice.customer)).filter(
            Invoice.status.in_(["open", "sent", "partial", "confirmed"]), Invoice.due_date < date.today(), Invoice.balance_due > 0)
        rows = q.order_by(Invoice.due_date).limit(int(arguments.get("limit", 100))).all()
        return {"items": [{"id": str(invoice.id), "invoice_id": str(invoice.id), "number": invoice.invoice_number,
            "customer_id": str(invoice.customer_id), "customer_name": invoice.customer.name if invoice.customer else "",
            "customer_email": invoice.customer.email if invoice.customer else "", "due_date": invoice.due_date.isoformat(),
            "balance": str(invoice.balance_due or 0)} for invoice in rows]}

    if name in {"get_mrr", "get_monthly_recurring_revenue"}:
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
            q = q.filter(Payment.payment_date >= start)
        if end:
            q = q.filter(Payment.payment_date < end + timedelta(days=1))
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
        rows = q.options(joinedload(Subscription.customer)).order_by(Subscription.end_date).limit(100).all()
        return {"items": [{"id": str(s.id), "number": s.subscription_number, "subscription_id": str(s.id),
            "customer_name": s.customer.name if s.customer else "", "customer_email": s.customer.email if s.customer else "",
            "end_date": s.end_date.isoformat()} for s in rows]}
    if name == "get_overdue_invoices":
        q = db.query(Invoice).filter(Invoice.due_date < date.today(), Invoice.balance_due > 0,
            Invoice.status.in_(["open", "sent", "partial", "confirmed"]))
        if own_customer:
            q = q.filter(Invoice.customer_id == user.customer_id)
        rows = q.options(joinedload(Invoice.customer)).order_by(Invoice.due_date).limit(100).all()
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
        total = db.query(func.coalesce(func.sum(Invoice.balance_due), 0)).filter(Invoice.customer_id == customer_id,
            Invoice.status.in_(["open", "sent", "partial", "confirmed"])).scalar()
        return {"customer_id": customer_id, "balance_due": str(total or 0)}
    if name == "get_revenue_by_plan":
        plan_by_subscription = (db.query(SubscriptionLine.subscription_id.label("subscription_id"),
            func.min(Plan.name).label("plan_name")).join(Plan, Plan.id == SubscriptionLine.plan_id)
            .group_by(SubscriptionLine.subscription_id).subquery())
        rows = db.query(plan_by_subscription.c.plan_name, func.coalesce(func.sum(Payment.amount), 0)).join(
            Invoice, Invoice.subscription_id == plan_by_subscription.c.subscription_id).join(
            Payment, Payment.invoice_id == Invoice.id).filter(Payment.status == "completed").group_by(
            plan_by_subscription.c.plan_name).all()
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
    if name in {"generate_due_invoice_preview", "preview_due_invoices"}:
        return {"items": preview_due_invoices(db)}
    if name == "get_subscriptions_due_for_billing":
        return {"items": preview_due_invoices(db)}
    if name == "create_invoice_drafts":
        if not arguments.get("dry_run", True):
            raise HTTPException(403, "Invoice drafts require administrator approval")
        return {"items": preview_due_invoices(db)}
    if name in {"prepare_renewal_reminders", "preview_renewal_reminders"}:
        days = max(1, min(int(arguments.get("days", 30)), 365))
        q = db.query(Subscription).options(joinedload(Subscription.customer), joinedload(Subscription.lines).joinedload(SubscriptionLine.plan)).filter(Subscription.status == "active", Subscription.end_date.is_not(None), Subscription.end_date <= date.today() + timedelta(days=days), Subscription.end_date >= date.today())
        rows = q.order_by(Subscription.end_date).all()
        return {"prepared": [{"customer_id": str(s.customer_id), "subscription_id": str(s.id),
            "subscription_number": s.subscription_number, "customer_name": s.customer.name if s.customer else "",
            "customer_email": s.customer.email if s.customer else "", "plan_name": next((line.plan.name for line in s.lines if line.plan), ""),
            "end_date": s.end_date.isoformat()} for s in rows], "sent": False, "approval_required_to_send": True}
    if name == "prepare_overdue_reminders":
        return {"items": execute_tool(db, user, "preview_overdue_reminders", arguments)["items"],
            "approval_required_to_send": True}
