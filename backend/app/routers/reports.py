import csv
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, literal_column
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.database.connection import get_db
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import User
from app.models.customer import Customer
from app.models.plan import Plan
from app.routers.analytics import _monthly_amount

router = APIRouter(prefix="/api/reports", tags=["reports"])
_MONTH = literal_column("'month'")
_OTHER = literal_column("'Other'")


@router.get("")
def complete_report(date_from: date | None = None, date_to: date | None = None,
                    plan: str | None = None, plan_id: UUID | None = None,
                    customer_id: UUID | None = None, db: Session = Depends(get_db),
                    _: User = Depends(require_roles("admin", "staff"))):
    """Contract aggregate report. Date filters apply to financial flows, not point-in-time metrics."""
    today = date.today()
    end = date_to or today
    start = date_from or date((end.year * 12 + end.month - 1 - 11) // 12,
        (end.year * 12 + end.month - 1 - 11) % 12 + 1, 1)
    if start > end:
        from fastapi import HTTPException
        raise HTTPException(422, "date_from must be on or before date_to")

    plan_filter = plan
    if plan_id:
        plan_filter = db.query(Plan.name).filter(Plan.id == plan_id).scalar()
        if not plan_filter:
            from fastapi import HTTPException
            raise HTTPException(404, "Plan not found")

    # A single deterministic plan label per subscription prevents multi-line subscriptions
    # from multiplying invoice totals in the grouped revenue queries.
    plan_by_subscription = (db.query(SubscriptionLine.subscription_id.label("subscription_id"),
            func.min(Plan.name).label("plan_name"))
        .join(Plan, Plan.id == SubscriptionLine.plan_id)
        .group_by(SubscriptionLine.subscription_id).subquery())

    sub_scope = db.query(Subscription.id).filter(Subscription.status == "active")
    point_sub_scope = db.query(Subscription.id)
    if customer_id:
        sub_scope = sub_scope.filter(Subscription.customer_id == customer_id)
        point_sub_scope = point_sub_scope.filter(Subscription.customer_id == customer_id)
    if plan_filter:
        sub_scope = sub_scope.filter(Subscription.id.in_(db.query(plan_by_subscription.c.subscription_id).filter(plan_by_subscription.c.plan_name == plan_filter)))
        point_sub_scope = point_sub_scope.filter(Subscription.id.in_(db.query(plan_by_subscription.c.subscription_id).filter(plan_by_subscription.c.plan_name == plan_filter)))

    active_count = sub_scope.count()
    active_rows = (db.query(Subscription.subtotal, Subscription.discount_total, Subscription.billing_period,
            Subscription.billing_interval)
        .filter(Subscription.id.in_(sub_scope)).all())
    mrr = sum((_monthly_amount(Decimal(str((subtotal or 0) - (discount or 0))), period, interval)
        for subtotal, discount, period, interval in active_rows), Decimal("0"))

    status_counts = dict(db.query(Subscription.status, func.count(Subscription.id))
        .filter(Subscription.id.in_(point_sub_scope)).group_by(Subscription.status).all())
    status_order = ("draft", "quotation", "confirmed", "active", "paused", "closed")

    invoice_scope = db.query(Invoice).filter(Invoice.status.notin_(["draft", "cancelled", "canceled"]))
    if customer_id:
        invoice_scope = invoice_scope.filter(Invoice.customer_id == customer_id)
    if plan_filter:
        invoice_scope = invoice_scope.filter(Invoice.subscription_id.in_(db.query(plan_by_subscription.c.subscription_id).filter(plan_by_subscription.c.plan_name == plan_filter)))
    financial_invoices = invoice_scope.filter(Invoice.invoice_date >= start, Invoice.invoice_date <= end)
    invoiced_total = financial_invoices.with_entities(func.coalesce(func.sum(Invoice.total), 0)).scalar() or 0
    monthly_invoice_rows = (financial_invoices.with_entities(func.date_trunc(_MONTH, Invoice.invoice_date), func.coalesce(func.sum(Invoice.total), 0))
        .group_by(func.date_trunc(_MONTH, Invoice.invoice_date)).all())
    month_invoice = {month.strftime("%Y-%m"): Decimal(str(amount or 0)) for month, amount in monthly_invoice_rows}
    plan_invoice_rows = (financial_invoices.outerjoin(plan_by_subscription, plan_by_subscription.c.subscription_id == Invoice.subscription_id)
        .with_entities(func.coalesce(plan_by_subscription.c.plan_name, _OTHER), func.coalesce(func.sum(Invoice.total), 0))
        .group_by(func.coalesce(plan_by_subscription.c.plan_name, _OTHER)).all())
    revenue_by_plan = {name: Decimal(str(amount or 0)) for name, amount in plan_invoice_rows}

    payment_scope = db.query(Payment).filter(Payment.status == "completed", Payment.payment_date >= start,
        Payment.payment_date < end + timedelta(days=1))
    if customer_id:
        payment_scope = payment_scope.filter(Payment.customer_id == customer_id)
    if plan_filter:
        payment_scope = payment_scope.filter(Payment.invoice.has(
            Invoice.subscription_id.in_(db.query(plan_by_subscription.c.subscription_id).filter(plan_by_subscription.c.plan_name == plan_filter))))
    payment_total = payment_scope.with_entities(func.coalesce(func.sum(Payment.amount), 0)).scalar() or 0
    payments_count = payment_scope.count()
    payment_month_rows = (payment_scope.with_entities(func.date_trunc(_MONTH, Payment.payment_date),
            func.coalesce(func.sum(Payment.amount), 0), func.count(Payment.id))
        .group_by(func.date_trunc(_MONTH, Payment.payment_date)).all())
    month_payment = {month.strftime("%Y-%m"): (Decimal(str(amount or 0)), int(count)) for month, amount, count in payment_month_rows}
    method_rows = payment_scope.with_entities(Payment.payment_method, func.coalesce(func.sum(Payment.amount), 0), func.count(Payment.id))\
        .group_by(Payment.payment_method).order_by(func.sum(Payment.amount).desc()).all()
    plan_payment_rows = (payment_scope.join(Invoice, Invoice.id == Payment.invoice_id)
        .outerjoin(plan_by_subscription, plan_by_subscription.c.subscription_id == Invoice.subscription_id)
        .with_entities(func.coalesce(plan_by_subscription.c.plan_name, _OTHER), func.coalesce(func.sum(Payment.amount), 0))
        .group_by(func.coalesce(plan_by_subscription.c.plan_name, _OTHER)).all())
    for name, amount in plan_payment_rows:
        revenue_by_plan.setdefault(name, Decimal("0"))
        # Keep invoice and cash collections separately for the grouped UI contract.
    collected_by_plan = {name: float(amount or 0) for name, amount in plan_payment_rows}

    # Point-in-time open balances and overdue aging respect the same plan/customer filters.
    balances = db.query(Invoice.balance_due, Invoice.due_date).filter(
        Invoice.status.in_(["open", "sent", "partial", "confirmed"]), Invoice.balance_due > 0)
    if customer_id:
        balances = balances.filter(Invoice.customer_id == customer_id)
    if plan_filter:
        balances = balances.filter(Invoice.subscription_id.in_(db.query(plan_by_subscription.c.subscription_id).filter(plan_by_subscription.c.plan_name == plan_filter)))
    outstanding_month_rows = (balances.with_entities(func.date_trunc(_MONTH, Invoice.due_date),
        func.coalesce(func.sum(Invoice.balance_due), 0))
        .group_by(func.date_trunc(_MONTH, Invoice.due_date))
        .order_by(func.date_trunc(_MONTH, Invoice.due_date)).all())
    outstanding_by_month = [{"month": month.strftime("%Y-%m"), "amount": float(amount or 0)}
        for month, amount in outstanding_month_rows]
    outstanding_total = balances.with_entities(func.coalesce(func.sum(Invoice.balance_due), 0)).scalar() or 0
    overdue_scope = balances.filter(Invoice.due_date < today)
    overdue_total, overdue_count = overdue_scope.with_entities(
        func.coalesce(func.sum(Invoice.balance_due), 0), func.count(Invoice.id)).one()
    overdue_total = overdue_total or 0

    bucket_expr = case(
        (Invoice.due_date >= today - timedelta(days=30), literal_column("'1–30 days'")),
        (Invoice.due_date >= today - timedelta(days=60), literal_column("'31–60 days'")),
        (Invoice.due_date >= today - timedelta(days=90), literal_column("'61–90 days'")),
        else_=literal_column("'90+ days'"),
    ).label("bucket")
    aging_rows = (overdue_scope.with_entities(bucket_expr,
            func.coalesce(func.sum(Invoice.balance_due), 0), func.count(Invoice.id))
        .group_by("bucket").all())
    aging_values = {bucket: (float(amount or 0), int(count)) for bucket, amount, count in aging_rows}
    overdue_aging = [{"bucket": bucket, "amount": aging_values.get(bucket, (0.0, 0))[0],
        "count": aging_values.get(bucket, (0.0, 0))[1]}
        for bucket in ("1–30 days", "31–60 days", "61–90 days", "90+ days")]

    subscription_lines = (db.query(Subscription, Customer.name, plan_by_subscription.c.plan_name)
        .join(Customer, Customer.id == Subscription.customer_id)
        .outerjoin(plan_by_subscription, plan_by_subscription.c.subscription_id == Subscription.id)
        .filter(Subscription.id.in_(point_sub_scope)).order_by(Subscription.created_at.desc()).limit(100).all())
    subscriptions = [{"id": str(sub.id), "number": sub.subscription_number, "customer_name": customer,
        "plan_name": plan_name or "", "status": sub.status, "start_date": sub.start_date.isoformat() if sub.start_date else "",
        "mrr": float(_monthly_amount(Decimal(str((sub.subtotal or 0) - (sub.discount_total or 0))), sub.billing_period, sub.billing_interval))}
        for sub, customer, plan_name in subscription_lines]

    sub_plan_rows = (db.query(Plan.name, Subscription.subtotal, Subscription.discount_total,
            Subscription.billing_period, Subscription.billing_interval)
        .join(SubscriptionLine, SubscriptionLine.plan_id == Plan.id)
        .join(Subscription, Subscription.id == SubscriptionLine.subscription_id)
        .filter(Subscription.status == "active", Subscription.id.in_(point_sub_scope))
        .all())
    plan_sub_counts = dict(db.query(Plan.name, func.count(func.distinct(Subscription.id)))
        .join(SubscriptionLine, SubscriptionLine.plan_id == Plan.id)
        .join(Subscription, Subscription.id == SubscriptionLine.subscription_id)
        .filter(Subscription.status == "active", Subscription.id.in_(point_sub_scope))
        .group_by(Plan.name).all())
    plan_sub_mrr: dict[str, Decimal] = {}
    for name, subtotal, discount, period, interval in sub_plan_rows:
        plan_sub_mrr[name] = plan_sub_mrr.get(name, Decimal("0")) + _monthly_amount(
            Decimal(str((subtotal or 0) - (discount or 0))), period, interval)
    subscriptions_by_plan = [{"plan": name, "count": count,
        "mrr": float(plan_sub_mrr.get(name, Decimal("0")))}
        for name, count in sorted(plan_sub_counts.items())]

    pay_rows = (payment_scope.with_entities(Payment, Invoice, Customer.name)
        .join(Invoice, Invoice.id == Payment.invoice_id)
        .join(Customer, Customer.id == Payment.customer_id)
        .order_by(Payment.payment_date.desc()).limit(100).all())
    payments = [{"id": str(p.id), "number": p.payment_reference or f"PAY-{str(p.id)[:8].upper()}",
        "payment_date": p.payment_date.date().isoformat() if p.payment_date else "", "customer_name": c,
        "invoice_id": str(i.id), "invoice_number": i.invoice_number,
        "method": (p.payment_method or "").replace(" ", "_"), "amount": float(p.amount)} for p, i, c in pay_rows]

    overdue_query = (db.query(Invoice, Customer.name, plan_by_subscription.c.plan_name)
        .join(Customer, Customer.id == Invoice.customer_id)
        .outerjoin(plan_by_subscription, plan_by_subscription.c.subscription_id == Invoice.subscription_id)
        .filter(Invoice.status.in_(["open", "sent", "partial", "confirmed"]), Invoice.due_date < today, Invoice.balance_due > 0))
    if customer_id:
        overdue_query = overdue_query.filter(Invoice.customer_id == customer_id)
    if plan_filter:
        overdue_query = overdue_query.filter(plan_by_subscription.c.plan_name == plan_filter)
    overdue_detail = [{"id": str(inv.id), "number": inv.invoice_number, "customer_name": customer,
        "plan_name": plan_name or "", "due_date": inv.due_date.isoformat(), "days_overdue": (today - inv.due_date).days,
        "balance": float(inv.balance_due or 0)} for inv, customer, plan_name in overdue_query.order_by(Invoice.due_date).limit(100).all()]

    months = []
    cursor = date(start.year, start.month, 1); stop = date(end.year, end.month, 1)
    while cursor <= stop:
        key = cursor.strftime("%Y-%m")
        months.append({"month": key, "invoiced": float(month_invoice.get(key, Decimal("0"))),
            "collected": float(month_payment.get(key, (Decimal("0"), 0))[0])})
        cursor = date(cursor.year + (cursor.month // 12), cursor.month % 12 + 1, 1)
    # Bucket each completed collection by the elapsed days between the invoice
    # issue date and the actual payment date. Use SQL aggregation so report size
    # does not grow with the number of payments.
    payment_days = func.date(Payment.payment_date) - Invoice.invoice_date
    timing_scope = db.query(Payment, Invoice).join(Invoice, Invoice.id == Payment.invoice_id).filter(
        Payment.status == "completed", Payment.payment_date >= start,
        Payment.payment_date < end + timedelta(days=1), payment_days >= 0)
    if customer_id:
        timing_scope = timing_scope.filter(Payment.customer_id == customer_id)
    if plan_filter:
        timing_scope = timing_scope.filter(Invoice.subscription_id.in_(
            db.query(plan_by_subscription.c.subscription_id).filter(plan_by_subscription.c.plan_name == plan_filter)))
    bucket_expr = case(
        (payment_days <= 7, literal_column("'0–7 days'")),
        (payment_days <= 15, literal_column("'8–15 days'")),
        (payment_days <= 30, literal_column("'16–30 days'")),
        else_=literal_column("'31+ days'"),
    ).label("bucket")
    timing_rows = (timing_scope.with_entities(bucket_expr, func.count(Payment.id),
            func.coalesce(func.sum(Payment.amount), 0))
        .group_by(bucket_expr).all())
    timing_values = {bucket: (int(count), float(amount or 0)) for bucket, count, amount in timing_rows}
    payment_timing = [{"bucket": bucket, "count": timing_values.get(bucket, (0, 0.0))[0],
        "amount": timing_values.get(bucket, (0, 0.0))[1]}
        for bucket in ("0–7 days", "8–15 days", "16–30 days", "31+ days")]
    avg_days = round(float(timing_scope.with_entities(func.avg(payment_days)).scalar()), 1) if timing_rows else None

    return {"summary": {"active_subscriptions": int(active_count), "mrr": float(mrr), "invoiced": float(invoiced_total),
        "collected": float(payment_total), "outstanding": float(outstanding_total),
        "overdue_amount": float(overdue_total), "overdue_count": int(overdue_count)},
        "revenue_by_month": months,
        "revenue_by_plan": [{"plan": name, "invoiced": float(amount), "collected": collected_by_plan.get(name, 0.0)} for name, amount in revenue_by_plan.items()],
        "subscriptions_by_status": [{"status": status, "count": int(status_counts.get(status, 0))} for status in status_order],
        "subscriptions_by_plan": subscriptions_by_plan, "subscriptions": subscriptions,
        "payments_by_month": [{"month": date(year, month, 1).strftime("%Y-%m"),
            "amount": float(month_payment.get(date(year, month, 1).strftime("%Y-%m"), (Decimal("0"), 0))[0]),
            "count": month_payment.get(date(year, month, 1).strftime("%Y-%m"), (Decimal("0"), 0))[1]}
            for year, month in [(int(item["month"][:4]), int(item["month"][5:])) for item in months]],
        "payments_by_method": [{"method": (method or "").replace(" ", "_"), "amount": float(amount or 0), "count": int(count)} for method, amount, count in method_rows],
        "payments": payments, "payments_total": int(payments_count), "payment_timing": payment_timing,
        "avg_days_to_pay": avg_days, "outstanding_by_month": outstanding_by_month, "overdue_aging": overdue_aging, "overdue": overdue_detail}


@router.get("/options")
def report_options(db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    return {"plans": [name for (name,) in db.query(Plan.name).filter(Plan.status == "active").order_by(Plan.name).distinct().all()],
        "customers": [{"id": str(cid), "name": name} for cid, name in db.query(Customer.id, Customer.name).filter(Customer.is_active.is_(True)).order_by(Customer.name).all()]}


def _csv(filename, headers, rows):
    stream = StringIO()
    writer = csv.writer(stream)
    writer.writerow(headers)
    writer.writerows(rows)
    stream.seek(0)
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/subscriptions")
def subscription_report(start_date: date | None = None, end_date: date | None = None, customer_id: UUID | None = None, status: str | None = None,
                       plan_id: UUID | None = None, product_id: UUID | None = None,
                       export: bool = False, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    q = db.query(Subscription)
    if start_date:
        q = q.filter(Subscription.created_at >= start_date)
    if end_date:
        q = q.filter(Subscription.created_at < end_date + timedelta(days=1))
    if customer_id:
        q = q.filter(Subscription.customer_id == customer_id)
    if status:
        q = q.filter(Subscription.status == status)
    if plan_id or product_id:
        q = q.join(SubscriptionLine, SubscriptionLine.subscription_id == Subscription.id)
        if plan_id:
            q = q.filter(SubscriptionLine.plan_id == plan_id)
        if product_id:
            q = q.filter(SubscriptionLine.product_id == product_id)
        q = q.distinct()
    rows = q.order_by(Subscription.created_at.desc()).all()
    data = [[str(s.id), s.subscription_number, str(s.customer_id), s.status, str(s.total or 0), s.created_at.isoformat() if s.created_at else ""] for s in rows]
    if export:
        return _csv("subscriptions.csv", ["id", "number", "customer_id", "status", "total", "created_at"], data)
    return {"items": [dict(zip(["id", "subscription_number", "customer_id", "status", "total", "created_at"], row)) for row in data], "count": len(data)}


@router.get("/payments")
def payment_report(start_date: date | None = None, end_date: date | None = None, customer_id: UUID | None = None,
                   plan_id: UUID | None = None, product_id: UUID | None = None, export: bool = False,
                   db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    q = db.query(Payment).filter(Payment.status == "completed")
    if start_date:
        q = q.filter(Payment.payment_date >= start_date)
    if end_date:
        q = q.filter(Payment.payment_date < end_date + timedelta(days=1))
    if customer_id:
        q = q.filter(Payment.customer_id == customer_id)
    if plan_id or product_id:
        q = q.join(Invoice, Payment.invoice_id == Invoice.id).join(Subscription, Invoice.subscription_id == Subscription.id).join(SubscriptionLine, SubscriptionLine.subscription_id == Subscription.id)
        if plan_id:
            q = q.filter(SubscriptionLine.plan_id == plan_id)
        if product_id:
            q = q.filter(SubscriptionLine.product_id == product_id)
        q = q.distinct()
    rows = q.order_by(Payment.payment_date.desc()).all()
    keys = ["id", "invoice_id", "customer_id", "amount", "payment_method", "payment_date"]
    values = [[str(p.id), str(p.invoice_id), str(p.customer_id), str(p.amount), p.payment_method, p.payment_date.isoformat() if p.payment_date else ""] for p in rows]
    if export:
        return _csv("payments.csv", keys, values)
    return {"items": [dict(zip(keys, r)) for r in values], "count": len(values)}


@router.get("/revenue")
def revenue_report(start_date: date | None = None, end_date: date | None = None, customer_id: UUID | None = None,
                   plan_id: UUID | None = None, product_id: UUID | None = None, export: bool = False,
                   db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    q = db.query(Payment).filter(Payment.status == "completed")
    if start_date:
        q = q.filter(Payment.payment_date >= start_date)
    if end_date:
        q = q.filter(Payment.payment_date < end_date + timedelta(days=1))
    if customer_id:
        q = q.filter(Payment.customer_id == customer_id)
    if plan_id or product_id:
        q = q.join(Invoice, Payment.invoice_id == Invoice.id).join(Subscription, Invoice.subscription_id == Subscription.id).join(SubscriptionLine, SubscriptionLine.subscription_id == Subscription.id)
        if plan_id:
            q = q.filter(SubscriptionLine.plan_id == plan_id)
        if product_id:
            q = q.filter(SubscriptionLine.product_id == product_id)
        q = q.distinct()
    rows = q.order_by(Payment.payment_date).all()
    data = [[p.payment_date.date().isoformat() if p.payment_date else "", str(p.amount), str(p.invoice_id), p.payment_method or ""] for p in rows]
    if export:
        return _csv("revenue.csv", ["date", "amount", "invoice_id", "method"], data)
    return {"items": [dict(zip(["date", "amount", "invoice_id", "method"], x)) for x in data], "total": str(sum((p.amount for p in rows), 0))}


@router.get("/overdue-invoices")
def overdue_invoices(customer_id: UUID | None = None, plan_id: UUID | None = None, product_id: UUID | None = None,
                     export: bool = False, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    q = db.query(Invoice).filter(Invoice.due_date < date.today(), Invoice.balance_due > 0, Invoice.status.notin_(["cancelled", "canceled"]))
    if customer_id:
        q = q.filter(Invoice.customer_id == customer_id)
    if plan_id or product_id:
        q = q.join(Subscription, Invoice.subscription_id == Subscription.id).join(SubscriptionLine, SubscriptionLine.subscription_id == Subscription.id)
        if plan_id:
            q = q.filter(SubscriptionLine.plan_id == plan_id)
        if product_id:
            q = q.filter(SubscriptionLine.product_id == product_id)
        q = q.distinct()
    rows = q.order_by(Invoice.due_date).all()
    data = [[str(i.id), i.invoice_number, str(i.customer_id), i.due_date.isoformat(), str(i.balance_due)] for i in rows]
    if export:
        return _csv("overdue-invoices.csv", ["id", "invoice_number", "customer_id", "due_date", "balance_due"], data)
    return {"items": [dict(zip(["id", "invoice_number", "customer_id", "due_date", "balance_due"], x)) for x in data], "count": len(data)}
