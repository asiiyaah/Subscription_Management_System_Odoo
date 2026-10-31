from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.discount import DiscountUsage
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceLine
from app.models.settings import BusinessSetting
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import User
from app.services.billing_service import generate_due_invoices, preview_due_invoices
from app.services.email_service import send_invoice_email
from app.services.subscription_service import next_billing_date

router = APIRouter(prefix="/api/invoices", tags=["invoices"])
_CONFIRMED_DB_STATUSES = ("open", "sent", "partial", "confirmed")
_CANCELLED_DB_STATUSES = ("cancelled", "canceled")


def _money(value):
    # Arithmetic stays in Decimal; JSON numbers preserve the existing frontend contract.
    return float(Decimal(str(value or 0)).quantize(Decimal("0.01")))


def _ui_status(status: str | None) -> str:
    if status in _CANCELLED_DB_STATUSES:
        return "cancelled"
    if status == "paid":
        return "paid"
    if status in _CONFIRMED_DB_STATUSES:
        return "confirmed"
    return "draft"


def _invoice_dict(invoice: Invoice):
    customer = invoice.customer
    sub = invoice.subscription
    lines = list(invoice.lines or [])
    plan = next((line.plan for line in (sub.lines if sub else []) if line.plan), None)
    period_start = invoice.invoice_date
    period_end = None
    if sub and sub.billing_period:
        try:
            period_end = next_billing_date(period_start, sub.billing_period, sub.billing_interval or 1)
            from datetime import timedelta
            period_end -= timedelta(days=1)
        except ValueError:
            pass
    status = invoice.status or "draft"
    base_status = status
    overdue = bool(status in _CONFIRMED_DB_STATUSES and invoice.due_date < date.today() and (invoice.balance_due or 0) > 0)
    tax_totals: dict[str, Decimal] = {}
    for line in lines:
        for tax in line.taxes:
            label = tax.tax_name_snapshot or "Tax"
            tax_totals[label] = tax_totals.get(label, Decimal("0")) + Decimal(str(tax.tax_amount or 0))
    # Discount usages are queried/attached by detail routes when present; list serialization
    # stays bounded and does not issue one extra query per invoice.
    discount = getattr(invoice, "_discount_payload", None)
    payment_terms = getattr(invoice, "_payment_terms", None)
    address_parts = [getattr(customer, name, None) for name in ("address", "city", "state", "postal_code", "country")]
    address = ", ".join(str(part) for part in address_parts if part)
    number = invoice.invoice_number
    balance = _money(invoice.balance_due)
    result = {
        "id": str(invoice.id), "number": number, "invoice_number": number,
        "status": _ui_status(status), "base_status": base_status,
        "is_overdue": overdue, "overdue": overdue, "ui_status": _ui_status(status),
        "customer_id": str(invoice.customer_id), "customer_name": customer.name if customer else "",
        "customer_email": customer.email if customer else None, "customer_address": address or None,
        "subscription_id": str(invoice.subscription_id) if invoice.subscription_id else None,
        "subscription_number": sub.subscription_number if sub else "",
        "plan_name": plan.name if plan else "",
        "invoice_date": invoice.invoice_date.isoformat(), "due_date": invoice.due_date.isoformat(),
        "period_start": period_start.isoformat(), "period_end": period_end.isoformat() if period_end else None,
        "payment_terms": payment_terms,
        "subtotal": _money(invoice.subtotal), "untaxed_amount": _money(invoice.subtotal),
        "discount_total": _money(invoice.discount_total), "discount": discount,
        "tax_total": _money(invoice.tax_total),
        "taxes": [{"label": label, "amount": _money(amount)} for label, amount in tax_totals.items()],
        "total": _money(invoice.total), "amount_paid": _money(invoice.amount_paid), "balance": balance,
        "balance_due": balance, "sent_at": invoice.sent_at.isoformat() if invoice.sent_at else None,
        "notes": invoice.notes,
        "lines": [{
            "id": str(line.id), "product_id": str(line.product_id) if line.product_id else None,
            "product_name": line.product.name if line.product else (line.description or ""),
            "description": line.description, "quantity": float(line.quantity or 1),
            "unit_price": _money(line.unit_price),
            "discount_amount": _money(line.discount_amount), "tax_amount": _money(line.tax_amount),
            "tax_label": ", ".join(dict.fromkeys(t.tax_name_snapshot or "Tax" for t in line.taxes)) or None,
            "amount": _money(Decimal(str(line.unit_price)) * Decimal(str(line.quantity or 1))),
            "line_total": _money(line.line_total),
            "taxes": [{"name": t.tax_name_snapshot, "rate": _money(t.tax_rate_snapshot), "amount": _money(t.tax_amount)} for t in line.taxes],
        } for line in lines],
        "payments": [{
            "id": str(payment.id), "number": payment.payment_reference or f"PAY-{str(payment.id)[:8].upper()}",
            "payment_date": payment.payment_date.date().isoformat() if payment.payment_date else None,
            "method": (payment.payment_method or "").replace(" ", "_"),
            "amount": _money(payment.amount), "note": payment.note,
        } for payment in sorted(invoice.payments or [], key=lambda p: p.payment_date or p.created_at)],
    }
    if discount is not None:
        result["discount"] = discount
    return result


def _scoped_query(db: Session, user: User):
    query = db.query(Invoice).options(
        joinedload(Invoice.customer), joinedload(Invoice.subscription).selectinload(Subscription.lines).joinedload(SubscriptionLine.plan),
        selectinload(Invoice.lines).joinedload(InvoiceLine.product), selectinload(Invoice.lines).selectinload(InvoiceLine.taxes),
        selectinload(Invoice.payments),
    )
    if user.role == "customer":
        query = query.filter(Invoice.customer_id == user.customer_id)
    return query


def _attach_detail_fields(db: Session, invoice: Invoice):
    usage = db.query(DiscountUsage).filter(or_(DiscountUsage.invoice_id == invoice.id,
        DiscountUsage.subscription_id == invoice.subscription_id)).order_by(DiscountUsage.used_at.desc()).first()
    if usage and usage.discount:
        invoice._discount_payload = {"code": usage.discount.code or "", "label": usage.discount.name, "amount": _money(usage.discount_amount)}
    settings = db.query(BusinessSetting).first()
    invoice._payment_terms = f"Net {settings.default_payment_terms}" if settings and settings.default_payment_terms is not None else "Net 15"
    return invoice


@router.get("")
def list_invoices(status_filter: str | None = Query(None, alias="status"), customer_id: UUID | None = None,
                  subscription_id: UUID | None = None, overdue: bool | None = None,
                  search: str | None = None, q: str | None = None,
                  sort_by: str = "invoice_date", sort_dir: str = "desc",
                  page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = _scoped_query(db, user)
    if user.role != "customer" and customer_id:
        query = query.filter(Invoice.customer_id == customer_id)
    if subscription_id:
        query = query.filter(Invoice.subscription_id == subscription_id)
    query_text = (q or search or "").strip()
    if query_text:
        like = f"%{query_text}%"
        query = query.filter(or_(Invoice.invoice_number.ilike(like),
            Invoice.customer.has(Customer.name.ilike(like)),
            Invoice.subscription.has(Subscription.subscription_number.ilike(like))))
    if status_filter == "confirmed":
        query = query.filter(Invoice.status.in_(_CONFIRMED_DB_STATUSES))
    elif status_filter in {"draft", "paid", "cancelled"}:
        query = query.filter(Invoice.status.in_(_CANCELLED_DB_STATUSES) if status_filter == "cancelled" else Invoice.status == status_filter)
    if status_filter == "overdue" or overdue is True:
        query = query.filter(Invoice.status.in_(_CONFIRMED_DB_STATUSES), Invoice.due_date < date.today(), Invoice.balance_due > 0)
    columns = {"number": Invoice.invoice_number, "invoice_number": Invoice.invoice_number,
        "balance": Invoice.balance_due, "balance_due": Invoice.balance_due,
        "total": Invoice.total, "invoice_date": Invoice.invoice_date, "due_date": Invoice.due_date,
        "status": Invoice.status, "created_at": Invoice.created_at}
    direction = sort_dir.lower()
    if direction not in {"asc", "desc"}:
        raise HTTPException(422, "sort_dir must be 'asc' or 'desc'")
    if sort_by in {"customer", "customer_name"}:
        column = Customer.name
        query = query.join(Customer, Customer.id == Invoice.customer_id)
    else:
        column = columns.get(sort_by, Invoice.invoice_date)
    query = query.order_by(column.asc() if direction == "asc" else column.desc(), Invoice.invoice_date.desc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_invoice_dict(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/summary")
def invoice_summary(db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    rows = db.query(Invoice.status, Invoice.due_date, Invoice.balance_due, Invoice.total, Invoice.amount_paid).all()
    counts = {key: 0 for key in ("all", "draft", "confirmed", "paid", "cancelled", "overdue")}
    invoiced = Decimal("0"); paid = Decimal("0"); outstanding = Decimal("0"); overdue_amount = Decimal("0")
    for status, due, balance, total, amount_paid in rows:
        counts["all"] += 1
        ui = _ui_status(status); counts[ui] += 1
        if ui not in {"draft", "cancelled"}:
            invoiced += Decimal(str(total or 0)); paid += Decimal(str(amount_paid or 0))
        if ui == "confirmed":
            outstanding += Decimal(str(balance or 0))
            if due < date.today() and (balance or 0) > 0:
                counts["overdue"] += 1; overdue_amount += Decimal(str(balance or 0))
    return {"counts": counts, "total_invoiced": _money(invoiced), "total_paid": _money(paid),
        "outstanding": _money(outstanding), "overdue_amount": _money(overdue_amount)}


@router.get("/due-preview")
def due_preview(on_date: date | None = None, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    return preview_due_invoices(db, on_date)


@router.post("/generate-due")
def generate_due(on_date: date | None = None, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    return generate_due_invoices(db, on_date)


@router.get("/{invoice_id}")
def get_invoice(invoice_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    invoice = _scoped_query(db, user).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    return _invoice_dict(_attach_detail_fields(db, invoice))


@router.post("/{invoice_id}/confirm")
def confirm_invoice(invoice_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status != "draft":
        raise HTTPException(409, "Only draft invoices can be confirmed")
    invoice.status = "open"
    db.commit()
    invoice = _scoped_query(db, _).filter(Invoice.id == invoice_id).first()
    return _invoice_dict(_attach_detail_fields(db, invoice))


@router.post("/{invoice_id}/send")
def send_invoice(invoice_id: UUID, db: Session = Depends(get_db), user: User = Depends(require_roles("admin", "staff"))):
    invoice = _scoped_query(db, user).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status not in _CONFIRMED_DB_STATUSES and invoice.status != "paid":
        raise HTTPException(409, "Only confirmed invoices can be sent")
    if not invoice.customer or not invoice.customer.email:
        raise HTTPException(422, "Customer has no email address")
    try:
        delivered = send_invoice_email(invoice.customer.email, invoice)
    except Exception as exc:
        raise HTTPException(502, f"Invoice email delivery failed ({type(exc).__name__})") from exc
    if not delivered:
        raise HTTPException(503, "Email delivery is not configured")
    from datetime import datetime, timezone
    invoice.status = "sent"
    invoice.sent_at = datetime.now(timezone.utc)
    db.commit()
    invoice = _scoped_query(db, user).filter(Invoice.id == invoice_id).first()
    return {"message": "Invoice sent", "invoice": _invoice_dict(invoice)}


@router.post("/{invoice_id}/cancel")
def cancel_invoice(invoice_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status not in ({"draft"} | set(_CONFIRMED_DB_STATUSES)):
        raise HTTPException(409, "Only draft or confirmed invoices can be cancelled")
    if (invoice.amount_paid or 0) > 0:
        raise HTTPException(409, "An invoice with payments cannot be cancelled")
    invoice.status = "cancelled"
    invoice.balance_due = 0
    db.commit()
    invoice = _scoped_query(db, _).filter(Invoice.id == invoice_id).first()
    return _invoice_dict(invoice)
