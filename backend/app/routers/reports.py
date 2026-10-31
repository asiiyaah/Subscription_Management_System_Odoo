import csv
from datetime import date, timedelta
from io import StringIO
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.database.connection import get_db
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import User

router = APIRouter(prefix="/api/reports", tags=["reports"])


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
