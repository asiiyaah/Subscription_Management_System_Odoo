from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.user import User
from app.services.payment_service import record_payment

router = APIRouter(prefix="/api/payments", tags=["payments"])


class PaymentInput(BaseModel):
    invoice_id: UUID
    amount: Decimal = Field(gt=0)
    payment_method: str
    payment_reference: str | None = Field(default=None, max_length=100)
    payment_date: datetime | None = None
    note: str | None = None

    @field_validator("payment_method")
    @classmethod
    def method_supported(cls, value):
        allowed = {"cash", "bank transfer", "upi", "card", "cheque"}
        if value.lower() not in allowed:
            raise ValueError("payment_method must be Cash, Bank transfer, UPI, Card, or Cheque")
        return value.lower()


def _payment_dict(p: Payment):
    return {"id": str(p.id), "invoice_id": str(p.invoice_id), "customer_id": str(p.customer_id),
        "payment_reference": p.payment_reference, "amount": str(p.amount), "payment_method": p.payment_method,
        "payment_date": p.payment_date.isoformat() if p.payment_date else None, "note": p.note, "status": p.status}


@router.get("")
def list_payments(invoice_id: UUID | None = None, customer_id: UUID | None = None,
                  page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Payment)
    if user.role == "customer":
        query = query.filter(Payment.customer_id == user.customer_id)
    elif customer_id:
        query = query.filter(Payment.customer_id == customer_id)
    if invoice_id:
        query = query.filter(Payment.invoice_id == invoice_id)
    total = query.count()
    rows = query.order_by(Payment.payment_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_payment_dict(p) for p in rows], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_payment(payload: PaymentInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    invoice = db.get(Invoice, payload.invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if user.role == "customer":
        if invoice.customer_id != user.customer_id:
            raise HTTPException(404, "Invoice not found")
        raise HTTPException(403, "Customers cannot record offline payments")
    payment = record_payment(db, invoice_id=payload.invoice_id, amount=payload.amount,
        payment_method=payload.payment_method, created_by=user.id,
        payment_reference=payload.payment_reference, note=payload.note, payment_date=payload.payment_date)
    return _payment_dict(payment)


@router.get("/{payment_id}")
def get_payment(payment_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Payment).filter(Payment.id == payment_id)
    if user.role == "customer":
        q = q.filter(Payment.customer_id == user.customer_id)
    payment = q.first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    return _payment_dict(payment)
