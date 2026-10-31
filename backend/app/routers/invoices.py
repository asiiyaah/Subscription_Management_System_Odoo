from datetime import date
from decimal import Decimal
import smtplib
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.models.activity import ActivityLog
from app.services.email_service import send_invoice_email

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.invoice import Invoice
from app.models.user import User
from app.services.billing_service import generate_due_invoices, preview_due_invoices

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


def _invoice_dict(invoice: Invoice):
    overdue = bool(invoice.due_date < date.today() and (invoice.balance_due or 0) > 0 and invoice.status not in {"cancelled", "canceled"})
    return {"id": str(invoice.id), "invoice_number": invoice.invoice_number, "customer_id": str(invoice.customer_id),
        "subscription_id": str(invoice.subscription_id) if invoice.subscription_id else None,
        "invoice_date": invoice.invoice_date.isoformat(), "due_date": invoice.due_date.isoformat(),
        "status": "overdue" if overdue else invoice.status, "subtotal": str(invoice.subtotal or 0),
        "discount_total": str(invoice.discount_total or 0), "tax_total": str(invoice.tax_total or 0),
        "total": str(invoice.total or 0), "amount_paid": str(invoice.amount_paid or 0),
        "balance_due": str(invoice.balance_due or 0), "overdue": overdue, "notes": invoice.notes,
        "lines": [{"id": str(l.id), "product_id": str(l.product_id) if l.product_id else None, "description": l.description,
            "quantity": str(l.quantity or 1), "unit_price": str(l.unit_price), "discount_amount": str(l.discount_amount or 0),
            "tax_amount": str(l.tax_amount or 0), "line_total": str(l.line_total),
            "taxes": [{"name": t.tax_name_snapshot, "rate": str(t.tax_rate_snapshot or 0), "amount": str(t.tax_amount or 0)} for t in l.taxes]} for l in invoice.lines]}


def _scoped_query(db: Session, user: User):
    q = db.query(Invoice).options(joinedload(Invoice.lines))
    if user.role == "customer":
        q = q.filter(Invoice.customer_id == user.customer_id)
    return q


@router.get("")
def list_invoices(status_filter: str | None = Query(None, alias="status"), customer_id: UUID | None = None,
                  overdue: bool | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = _scoped_query(db, user)
    if user.role != "customer" and customer_id:
        query = query.filter(Invoice.customer_id == customer_id)
    if status_filter == "overdue" or overdue is True:
        query = query.filter(Invoice.due_date < date.today(), Invoice.balance_due > 0, Invoice.status.notin_(["cancelled", "canceled"]))
    elif status_filter:
        query = query.filter(Invoice.status == status_filter)
    total = query.count()
    rows = query.order_by(Invoice.invoice_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_invoice_dict(i) for i in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/due-preview")
def due_preview(on_date: date | None = None, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    items = preview_due_invoices(db, on_date)
    total = sum((Decimal(x["total"]) for x in items if not x["already_invoiced"]), Decimal("0"))
    return {"items": items, "count": len(items), "total_amount": str(total)}


@router.post("/generate-due")
def generate_due(on_date: date | None = None, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    return generate_due_invoices(db, on_date)


@router.get("/{invoice_id}")
def get_invoice(invoice_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    invoice = _scoped_query(db, user).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    return _invoice_dict(invoice)


@router.post("/{invoice_id}/confirm")
def confirm_invoice(invoice_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status != "draft":
        raise HTTPException(409, "Only draft invoices can be confirmed")
    invoice.status = "open"
    db.commit()
    return _invoice_dict(invoice)


@router.post("/{invoice_id}/send")
def send_invoice(invoice_id: UUID, db: Session = Depends(get_db), user: User = Depends(require_roles("admin", "staff"))):
    invoice = db.query(Invoice).options(joinedload(Invoice.customer), joinedload(Invoice.lines)).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status not in {"open", "sent", "partial"}:
        raise HTTPException(409, "Only open invoices can be marked as sent")
    if not invoice.customer.email:
        raise HTTPException(422, "Customer has no email address")
    try:
        delivered = send_invoice_email(invoice.customer.email, invoice)
    except (OSError, smtplib.SMTPException) as exc:
        raise HTTPException(502, f"Invoice email delivery failed ({type(exc).__name__})") from exc
    if not delivered:
        raise HTTPException(503, "Email delivery is not configured")
    invoice.status = "sent"
    db.add(ActivityLog(user_id=user.id, action="invoice_sent", entity_type="invoice", entity_id=invoice.id,
        description=f"Sent invoice {invoice.invoice_number} to customer"))
    db.commit()
    return {"message": "Invoice marked as sent", "invoice_id": str(invoice.id)}


@router.post("/{invoice_id}/cancel")
def cancel_invoice(invoice_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if (invoice.amount_paid or 0) > 0:
        raise HTTPException(409, "An invoice with payments cannot be cancelled")
    invoice.status = "cancelled"
    invoice.balance_due = 0
    db.commit()
    return {"message": "Invoice cancelled"}
