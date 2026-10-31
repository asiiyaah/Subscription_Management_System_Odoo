from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import User
from app.services.subscription_service import transition_subscription
from app.routers.settings import ProfileInput, update_profile

router = APIRouter(prefix="/api/portal", tags=["customer portal"])


def _customer_required(user: User):
    if user.role != "customer" or not user.customer_id:
        raise HTTPException(403, "Customer portal access is required")
    return user.customer_id


@router.get("/profile")
def profile(user: User = Depends(get_current_user)):
    _customer_required(user)
    return {"id": str(user.customer_id), "name": user.name, "email": user.email,
        "phone": user.customer.phone if user.customer else None, "company": user.customer.company if user.customer else None}


@router.patch("/profile")
def update_portal_profile(payload: ProfileInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _customer_required(user)
    update_profile(payload, db, user)
    return profile(user)


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    customer_id = _customer_required(user)
    subs = db.query(Subscription).filter(Subscription.customer_id == customer_id).all()
    invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id).all()
    payments = db.query(Payment).filter(Payment.customer_id == customer_id).all()
    return {"active_subscriptions": sum(s.status == "active" for s in subs),
        "open_invoices": sum(i.status not in {"paid", "cancelled", "canceled"} for i in invoices),
        "balance_due": str(sum((i.balance_due or 0 for i in invoices), 0)),
        "recent_payments": [{"id": str(p.id), "amount": str(p.amount), "payment_date": p.payment_date.isoformat() if p.payment_date else None} for p in sorted(payments, key=lambda p: p.payment_date or p.created_at, reverse=True)[:5]]}


@router.get("/subscriptions")
def my_subscriptions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    rows = db.query(Subscription).filter(Subscription.customer_id == cid).order_by(Subscription.created_at.desc()).all()
    return {"items": [{"id": str(s.id), "subscription_number": s.subscription_number, "status": s.status,
        "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None, "total": str(s.total or 0)} for s in rows]}


@router.get("/subscriptions/{subscription_id}")
def subscription_detail(subscription_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    s = db.query(Subscription).options(joinedload(Subscription.lines)).filter(Subscription.id == subscription_id, Subscription.customer_id == cid).first()
    if not s:
        raise HTTPException(404, "Subscription not found")
    return {"id": str(s.id), "subscription_number": s.subscription_number, "status": s.status,
        "billing_period": s.billing_period, "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None,
        "total": str(s.total or 0), "lines": [{"product_id": str(l.product_id), "description": l.description, "quantity": str(l.quantity or 1), "line_total": str(l.line_total)} for l in s.lines]}


@router.post("/subscriptions/{subscription_id}/{action}")
def subscription_self_service(subscription_id: UUID, action: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    if action not in {"pause", "resume", "close", "renew"}:
        raise HTTPException(403, "Action is not available in the customer portal")
    sub = db.query(Subscription).options(selectinload(Subscription.lines).joinedload(SubscriptionLine.plan)).filter(Subscription.id == subscription_id, Subscription.customer_id == cid).with_for_update().first()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if action == "renew":
        if any(line.plan and not line.plan.is_renewable for line in sub.lines):
            raise HTTPException(409, "The selected plan does not allow renewal")
        from app.services.subscription_service import next_billing_date
        anchor = sub.next_billing_date if sub.next_billing_date and sub.next_billing_date > date.today() else date.today()
        sub.next_billing_date = next_billing_date(anchor, sub.billing_period or "monthly", sub.billing_interval or 1)
        from app.models.subscription import SubscriptionHistory
        from app.services.activity_service import log_activity
        db.add(SubscriptionHistory(subscription_id=sub.id, previous_status=sub.status, new_status=sub.status, action="customer_renew", changed_by=user.id))
        log_activity(db, user_id=user.id, action="subscription_renew", entity_type="subscription", entity_id=sub.id)
        db.commit()
        return {"id": str(sub.id), "status": sub.status, "next_billing_date": sub.next_billing_date.isoformat()}
    target = {"pause": "paused", "resume": "active", "close": "closed"}[action]
    transition_subscription(db, sub, target, user_id=user.id, action=f"customer_{action}")
    db.commit()
    return {"id": str(sub.id), "status": sub.status}


@router.get("/invoices")
def my_invoices(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    rows = db.query(Invoice).filter(Invoice.customer_id == cid).order_by(Invoice.invoice_date.desc()).all()
    return {"items": [{"id": str(i.id), "invoice_number": i.invoice_number, "status": i.status, "invoice_date": i.invoice_date.isoformat(), "due_date": i.due_date.isoformat(), "total": str(i.total or 0), "balance_due": str(i.balance_due or 0)} for i in rows]}


@router.get("/invoices/{invoice_id}")
def invoice_detail(invoice_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    i = db.query(Invoice).options(joinedload(Invoice.lines)).filter(Invoice.id == invoice_id, Invoice.customer_id == cid).first()
    if not i:
        raise HTTPException(404, "Invoice not found")
    return {"id": str(i.id), "invoice_number": i.invoice_number, "status": i.status, "invoice_date": i.invoice_date.isoformat(), "due_date": i.due_date.isoformat(), "total": str(i.total or 0), "amount_paid": str(i.amount_paid or 0), "balance_due": str(i.balance_due or 0), "lines": [{"description": l.description, "quantity": str(l.quantity or 1), "line_total": str(l.line_total)} for l in i.lines]}


@router.get("/payments")
def my_payments(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cid = _customer_required(user)
    rows = db.query(Payment).filter(Payment.customer_id == cid).order_by(Payment.payment_date.desc()).all()
    return {"items": [{"id": str(p.id), "invoice_id": str(p.invoice_id), "amount": str(p.amount), "payment_method": p.payment_method, "payment_date": p.payment_date.isoformat() if p.payment_date else None} for p in rows]}
