from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceLine
from app.models.payment import Payment
from app.models.subscription import Subscription, SubscriptionHistory, SubscriptionLine
from app.models.user import User
from app.routers.invoices import _attach_detail_fields, _invoice_dict, _ui_status
from app.routers.settings import ProfileInput, update_profile
from app.services.subscription_service import transition_subscription

router = APIRouter(prefix="/api/portal", tags=["customer portal"])
_CONFIRMED = ("open", "sent", "partial", "confirmed")


def _customer_required(user: User):
    if user.role != "customer" or not user.customer_id:
        raise HTTPException(403, "Customer portal access is required")
    return user.customer_id


def _invoice_query(db: Session, customer_id):
    return db.query(Invoice).options(
        joinedload(Invoice.customer), joinedload(Invoice.subscription).selectinload(Subscription.lines).joinedload(SubscriptionLine.plan),
        selectinload(Invoice.lines).joinedload(InvoiceLine.product), selectinload(Invoice.lines).selectinload(InvoiceLine.taxes),
        selectinload(Invoice.payments),
    ).filter(Invoice.customer_id == customer_id)


@router.get("/profile")
def profile(user: User = Depends(get_current_user)):
    _customer_required(user)
    customer = user.customer
    return {"id": str(user.customer_id), "name": user.name, "email": user.email,
        "phone": customer.phone if customer else None, "company": customer.company if customer else None,
        "billing_address": customer.address if customer else None}


@router.patch("/profile")
def update_portal_profile(payload: ProfileInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _customer_required(user)
    update_profile(payload, db, user)
    return profile(user)


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    customer_id = _customer_required(user)
    today = date.today()
    subscriptions = db.query(func.count(Subscription.id)).filter(Subscription.customer_id == customer_id).scalar() or 0
    invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id, Invoice.status != "draft")
    outstanding = db.query(func.coalesce(func.sum(Invoice.balance_due), 0)).filter(
        Invoice.customer_id == customer_id, Invoice.status.in_(_CONFIRMED), Invoice.balance_due > 0).scalar()
    overdue = db.query(func.coalesce(func.sum(Invoice.balance_due), 0)).filter(
        Invoice.customer_id == customer_id, Invoice.status.in_(_CONFIRMED), Invoice.due_date < today, Invoice.balance_due > 0).scalar()
    next_due = db.query(func.min(Invoice.due_date)).filter(
        Invoice.customer_id == customer_id, Invoice.status.in_(_CONFIRMED), Invoice.balance_due > 0).scalar()
    recent_rows = _invoice_query(db, customer_id).filter(Invoice.status != "draft").order_by(Invoice.invoice_date.desc()).limit(5).all()
    return {"customer_name": user.customer.name if user.customer else user.name,
        "active_subscriptions": db.query(func.count(Subscription.id)).filter(Subscription.customer_id == customer_id, Subscription.status == "active").scalar() or 0,
        "subscriptions": int(subscriptions), "outstanding": float(Decimal(str(outstanding or 0))),
        "overdue_amount": float(Decimal(str(overdue or 0))), "next_due": next_due.isoformat() if next_due else None,
        "open_invoices": invoices.filter(Invoice.status.notin_(["paid", "cancelled", "canceled"])).count(),
        "balance_due": float(Decimal(str(outstanding or 0))),
        "recent_invoices": [_invoice_dict(row) for row in recent_rows]}


@router.get("/subscriptions")
def my_subscriptions(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    query = db.query(Subscription).filter(Subscription.customer_id == cid)
    total = query.count()
    rows = query.order_by(Subscription.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{"id": str(s.id), "subscription_number": s.subscription_number, "status": s.status,
        "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None,
        "total": float(Decimal(str(s.total or 0)))} for s in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/subscriptions/{subscription_id}")
def subscription_detail(subscription_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    sub = db.query(Subscription).options(joinedload(Subscription.lines).joinedload(SubscriptionLine.plan)).filter(
        Subscription.id == subscription_id, Subscription.customer_id == cid).first()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    return {"id": str(sub.id), "subscription_number": sub.subscription_number, "status": sub.status,
        "billing_period": sub.billing_period, "next_billing_date": sub.next_billing_date.isoformat() if sub.next_billing_date else None,
        "total": float(Decimal(str(sub.total or 0))), "lines": [{"product_id": str(line.product_id),
        "description": line.description, "quantity": float(line.quantity or 1), "line_total": float(Decimal(str(line.line_total)))} for line in sub.lines]}


@router.post("/subscriptions/{subscription_id}/{action}")
def subscription_self_service(subscription_id: UUID, action: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    if action not in {"pause", "resume", "close", "renew"}:
        raise HTTPException(403, "Action is not available in the customer portal")
    sub = db.query(Subscription).options(selectinload(Subscription.lines).joinedload(SubscriptionLine.plan)).filter(
        Subscription.id == subscription_id, Subscription.customer_id == cid).with_for_update().first()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if action == "renew":
        if any(line.plan and not line.plan.is_renewable for line in sub.lines):
            raise HTTPException(409, "The selected plan does not allow renewal")
        from app.services.subscription_service import next_billing_date
        anchor = sub.next_billing_date if sub.next_billing_date and sub.next_billing_date > date.today() else date.today()
        sub.next_billing_date = next_billing_date(anchor, sub.billing_period or "monthly", sub.billing_interval or 1)
        from app.services.activity_service import log_activity
        db.add(SubscriptionHistory(subscription_id=sub.id, previous_status=sub.status, new_status=sub.status,
            action="customer_renew", changed_by=user.id))
        log_activity(db, user_id=user.id, action="subscription_renew", entity_type="subscription", entity_id=sub.id)
        db.commit()
        return {"id": str(sub.id), "status": sub.status, "next_billing_date": sub.next_billing_date.isoformat()}
    target = {"pause": "paused", "resume": "active", "close": "closed"}[action]
    transition_subscription(db, sub, target, user_id=user.id, action=f"customer_{action}")
    db.commit()
    return {"id": str(sub.id), "status": sub.status}


@router.get("/invoices")
def my_invoices(status: str | None = None, q: str | None = None, search: str | None = None,
                unpaid: bool = False, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    query = _invoice_query(db, cid).filter(Invoice.status != "draft")
    if status:
        if status == "confirmed":
            query = query.filter(Invoice.status.in_(_CONFIRMED))
        elif status == "cancelled":
            query = query.filter(Invoice.status.in_(["cancelled", "canceled"]))
        else:
            query = query.filter(Invoice.status == status)
    if unpaid:
        query = query.filter(Invoice.balance_due > 0, Invoice.status.in_(_CONFIRMED))
    term = (q or search or "").strip()
    if term:
        from app.models.subscription import Subscription
        like = f"%{term}%"
        query = query.filter(or_(Invoice.invoice_number.ilike(like), Invoice.subscription.has(Subscription.subscription_number.ilike(like))))
    total = query.count()
    rows = query.order_by(Invoice.invoice_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_invoice_dict(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/invoices/{invoice_id}")
def invoice_detail(invoice_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    invoice = _invoice_query(db, cid).filter(Invoice.id == invoice_id, Invoice.status != "draft").first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    return _invoice_dict(_attach_detail_fields(db, invoice))


@router.get("/payments")
def my_payments(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    query = db.query(Payment).options(joinedload(Payment.customer), joinedload(Payment.invoice)).filter(Payment.customer_id == cid)
    total = query.count()
    rows = query.order_by(Payment.payment_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    from app.routers.payments import _payment_dict
    return {"items": [_payment_dict(row) for row in rows], "total": total, "page": page, "page_size": page_size}
