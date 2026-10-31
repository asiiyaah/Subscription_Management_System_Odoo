from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.payment import Payment
from app.services.activity_service import log_activity
from app.services.pricing_service import money


def record_payment(db: Session, *, invoice_id: UUID, amount: Decimal, payment_method: str,
                   created_by: UUID, payment_reference: str | None = None,
                   note: str | None = None, payment_date=None) -> Payment:
    amount = money(amount)
    if amount <= 0:
        raise HTTPException(422, "Payment amount must be greater than zero")
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status in {"draft", "cancelled", "canceled", "paid"}:
        raise HTTPException(409, "Payments can only be recorded for confirmed invoices")
    balance = money(invoice.balance_due if invoice.balance_due is not None else invoice.total or 0)
    if amount > balance:
        raise HTTPException(422, "Payment exceeds the outstanding balance")
    payment = Payment(invoice_id=invoice.id, customer_id=invoice.customer_id,
        payment_reference=payment_reference, amount=amount, payment_method=payment_method,
        payment_date=payment_date, note=note, status="completed", created_by=created_by)
    invoice.amount_paid = money((invoice.amount_paid or 0) + amount)
    invoice.balance_due = money(balance - amount)
    invoice.status = "paid" if invoice.balance_due == 0 else "partial"
    db.add(payment)
    db.flush()
    log_activity(db, user_id=created_by, action="payment_recorded", entity_type="payment",
        entity_id=payment.id, description=f"Recorded payment of {amount} for invoice {invoice.invoice_number}")
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Payment reference already exists or payment conflicts with invoice state") from exc
    db.refresh(payment)
    return payment
