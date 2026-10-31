from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.user import User
from app.services.payment_service import record_payment

router = APIRouter(prefix="/api/payments", tags=["payments"])
_METHODS = {"cash", "bank transfer", "bank_transfer", "upi", "card", "cheque"}


class PaymentInput(BaseModel):
    invoice_id: UUID
    amount: Decimal = Field(gt=0)
    payment_method: str = Field(validation_alias=AliasChoices("method", "payment_method"))
    payment_reference: str | None = Field(default=None, max_length=100)
    payment_date: date | datetime | None = None
    note: str | None = None

    @field_validator("payment_method")
    @classmethod
    def method_supported(cls, value):
        normalized = value.strip().lower().replace("-", "_")
        if normalized not in _METHODS:
            raise ValueError("method must be cash, bank_transfer, upi, card, or cheque")
        return "bank transfer" if normalized == "bank_transfer" else normalized

    @field_validator("payment_date")
    @classmethod
    def date_as_datetime(cls, value):
        if isinstance(value, date) and not isinstance(value, datetime):
            return datetime.combine(value, time.min, tzinfo=timezone.utc)
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


def _method(value: str | None) -> str:
    return (value or "").lower().replace(" ", "_")


def _number(payment: Payment) -> str:
    return payment.payment_reference or f"PAY-{str(payment.id)[:8].upper()}"


def _payment_dict(payment: Payment):
    invoice = payment.invoice
    customer = payment.customer
    return {"id": str(payment.id), "number": _number(payment),
        "invoice_id": str(payment.invoice_id), "invoice_number": invoice.invoice_number if invoice else "",
        "customer_id": str(payment.customer_id), "customer_name": customer.name if customer else "",
        "payment_reference": payment.payment_reference, "amount": float(Decimal(str(payment.amount)).quantize(Decimal("0.01"))),
        "method": _method(payment.payment_method), "payment_method": payment.payment_method,
        "payment_date": payment.payment_date.date().isoformat() if payment.payment_date else None,
        "note": payment.note, "status": payment.status}


def _query(db: Session, user: User):
    query = db.query(Payment).options(joinedload(Payment.customer), joinedload(Payment.invoice))
    if user.role == "customer":
        query = query.filter(Payment.customer_id == user.customer_id)
    return query


@router.get("")
def list_payments(invoice_id: UUID | None = None, customer_id: UUID | None = None,
                  search: str | None = None, q: str | None = None, method: str | None = None,
                  date_from: date | None = None, date_to: date | None = None,
                  sort_by: str = "payment_date", sort_dir: str = "desc",
                  page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = _query(db, user)
    if user.role != "customer" and customer_id:
        query = query.filter(Payment.customer_id == customer_id)
    if invoice_id:
        query = query.filter(Payment.invoice_id == invoice_id)
    if method:
        normalized = method.lower().replace("_", " ")
        query = query.filter(func.lower(Payment.payment_method) == normalized)
    if date_from:
        query = query.filter(Payment.payment_date >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        query = query.filter(Payment.payment_date < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc))
    term = (q or search or "").strip()
    if term:
        like = f"%{term}%"
        query = query.join(Payment.customer).join(Payment.invoice).filter(or_(
            Payment.payment_reference.ilike(like), Payment.note.ilike(like), Invoice.invoice_number.ilike(like),
            Customer.name.ilike(like)))
    columns = {"number": Payment.payment_reference, "payment_date": Payment.payment_date,
        "date": Payment.payment_date, "amount": Payment.amount, "method": Payment.payment_method,
        "customer_name": Customer.name, "invoice_number": Invoice.invoice_number}
    column = columns.get(sort_by, Payment.payment_date)
    if sort_by in {"customer_name", "invoice_number"} and not term:
        query = query.join(Payment.customer if sort_by == "customer_name" else Payment.invoice)
    query = query.order_by(column.asc() if sort_dir.lower() == "asc" else column.desc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_payment_dict(payment) for payment in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/summary")
def payment_summary(db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    today = date.today()
    month_start = today.replace(day=1)
    month_start_dt = datetime.combine(month_start, time.min, tzinfo=timezone.utc)
    amounts = db.query(Payment.payment_method, func.sum(Payment.amount), func.count(Payment.id)).filter(
        Payment.status == "completed", Payment.payment_date >= month_start_dt).group_by(Payment.payment_method).all()
    by_method = [{"method": _method(name), "amount": float(total or 0), "count": int(count)} for name, total, count in amounts]
    by_method.sort(key=lambda row: row["amount"], reverse=True)
    outstanding = db.query(func.coalesce(func.sum(Invoice.balance_due), 0)).filter(
        Invoice.status.in_(["open", "sent", "partial", "confirmed"]), Invoice.balance_due > 0).scalar()
    total = sum(row["amount"] for row in by_method)
    count = sum(row["count"] for row in by_method)
    return {"collected_this_month": total, "payments_this_month": count,
        "top_method": by_method[0]["method"] if by_method else None,
        "outstanding": float(outstanding or 0), "by_method": by_method}


@router.post("", status_code=201)
def create_payment(payload: PaymentInput, db: Session = Depends(get_db), user: User = Depends(require_roles("admin", "staff"))):
    invoice = db.get(Invoice, payload.invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status in {"draft", "cancelled", "canceled"}:
        raise HTTPException(409, "Payments can only be recorded for confirmed invoices")
    payment = record_payment(db, invoice_id=payload.invoice_id, amount=payload.amount,
        payment_method=payload.payment_method, created_by=user.id,
        payment_reference=payload.payment_reference, note=payload.note, payment_date=payload.payment_date)
    from sqlalchemy.orm import selectinload
    from app.models.invoice import InvoiceLine
    invoice = db.query(Invoice).options(joinedload(Invoice.customer),
        joinedload(Invoice.subscription), selectinload(Invoice.lines).joinedload(InvoiceLine.product),
        selectinload(Invoice.lines).selectinload(InvoiceLine.taxes), selectinload(Invoice.payments)).filter(Invoice.id == payload.invoice_id).first()
    from app.routers.invoices import _attach_detail_fields, _invoice_dict
    return _invoice_dict(_attach_detail_fields(db, invoice))


@router.get("/{payment_id}")
def get_payment(payment_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    payment = _query(db, user).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    return _payment_dict(payment)
