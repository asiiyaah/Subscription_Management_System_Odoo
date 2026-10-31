from uuid import UUID
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.dependencies import require_roles
from app.database.connection import get_db
from app.models.customer import Customer
from app.models.activity import ActivityLog
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.user import User
from app.models.user import PasswordResetToken
from app.core.security import hash_password
from app.services.email_service import send_invite_email, send_password_reset_email
from app.services.activity_service import log_activity
from app.models.user import PasswordResetToken
from app.core.security import hash_password
from app.services.email_service import send_password_reset_email

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _customer_rows(db: Session, rows: list[Customer]):
    ids = [row.id for row in rows]
    if not ids:
        return []
    active_counts = dict(db.query(Subscription.customer_id, func.sum(case((Subscription.status == "active", 1), else_=0)))
        .filter(Subscription.customer_id.in_(ids)).group_by(Subscription.customer_id).all())
    outstanding = dict(db.query(Invoice.customer_id, func.coalesce(func.sum(case((Invoice.status.in_(["open", "sent", "partial", "confirmed"]), Invoice.balance_due), else_=0)), 0))
        .filter(Invoice.customer_id.in_(ids)).group_by(Invoice.customer_id).all())
    paid = dict(db.query(Payment.customer_id, func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.customer_id.in_(ids), Payment.status == "completed").group_by(Payment.customer_id).all())
    portal_ids = {cid for (cid,) in db.query(User.customer_id).filter(User.customer_id.in_(ids), User.is_active.is_(True)).all()}
    return [CustomerOutput.model_validate(row).model_dump(mode="json") | {
        "billing_address": row.address, "active_subscriptions": int(active_counts.get(row.id, 0) or 0),
        "outstanding_amount": float(outstanding.get(row.id, 0) or 0), "total_paid": float(paid.get(row.id, 0) or 0),
        "portal_access": row.id in portal_ids, "created_at": row.created_at.isoformat() if row.created_at else None,
    } for row in rows]


class CustomerInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    company: str | None = Field(default=None, max_length=150)
    address: str | None = None
    billing_address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    is_active: bool = True


class CustomerOutput(BaseModel):
    id: UUID
    name: str
    email: str | None
    phone: str | None
    company: str | None
    address: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str | None
    is_active: bool | None
    model_config = ConfigDict(from_attributes=True)


class CustomerPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    company: str | None = Field(default=None, max_length=150)
    address: str | None = None
    billing_address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    is_active: bool | None = None


@router.get("")
def list_customers(q: str | None = None, search: str | None = None, active: bool | None = None,
                   page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    query = db.query(Customer)
    term = q or search
    if term:
        query = query.filter(or_(Customer.name.ilike(f"%{term}%"), Customer.email.ilike(f"%{term}%"), Customer.company.ilike(f"%{term}%")))
    if active is not None:
        query = query.filter(Customer.is_active.is_(active))
    total = query.count()
    rows = query.order_by(Customer.name).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": _customer_rows(db, rows), "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_customer(payload: CustomerInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    data = payload.model_dump(exclude={"billing_address"})
    data["address"] = payload.billing_address or payload.address
    customer = Customer(**data)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _customer_rows(db, [customer])[0]


@router.get("/{customer_id}")
def get_customer(customer_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    data = _customer_rows(db, [customer])[0]
    data["customer_since"] = customer.created_at.date().isoformat() if customer.created_at else None
    data.update({"subscriptions": [{"id": str(s.id), "subscription_number": s.subscription_number, "status": s.status, "total": str(s.total or 0)} for s in customer.subscriptions],
                 "invoices": [{"id": str(i.id), "invoice_number": i.invoice_number, "status": i.status, "total": str(i.total or 0), "balance_due": str(i.balance_due or 0)} for i in customer.invoices],
                 "payments": [{"id": str(p.id), "amount": str(p.amount), "payment_date": p.payment_date.isoformat() if p.payment_date else None, "payment_method": p.payment_method} for p in customer.payments]})
    entity_ids = [s.id for s in customer.subscriptions] + [i.id for i in customer.invoices] + [p.id for p in customer.payments]
    logs = db.query(ActivityLog).filter(ActivityLog.entity_id.in_(entity_ids)).order_by(ActivityLog.created_at.desc()).limit(50).all() if entity_ids else []
    data["activity"] = [{"action": a.action, "entity_type": a.entity_type, "description": a.description, "created_at": a.created_at.isoformat() if a.created_at else None} for a in logs]
    return data


@router.patch("/{customer_id}")
@router.put("/{customer_id}")
def update_customer(customer_id: UUID, payload: CustomerPatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    data = payload.model_dump(exclude_unset=True)
    if "billing_address" in data:
        data["address"] = data.pop("billing_address")
    for key, value in data.items():
        if key == "email" and value is not None:
            value = str(value).lower()
        setattr(customer, key, value)
    db.commit()
    return _customer_rows(db, [customer])[0]


@router.delete("/{customer_id}")
def deactivate_customer(customer_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    customer.is_active = False
    db.commit()
    return {"message": "Customer deactivated"}




@router.post("/{customer_id}/invite", status_code=202)
def invite_customer(customer_id: UUID, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin", "staff"))):
    customer = db.get(Customer, customer_id)
    if not customer or not customer.email:
        raise HTTPException(404, "Customer with an email address not found")
    if customer.portal_user:
        raise HTTPException(409, "Customer already has a portal account")
    user = User(name=customer.name, email=customer.email.lower(), password_hash=hash_password(secrets.token_urlsafe(48)), role="customer", is_active=True, customer_id=customer.id)
    db.add(user)
    try:
        db.flush()
        from app.routers.auth import create_password_reset_token
        invite_token = create_password_reset_token(db, user, "invite")
        if not send_invite_email(user.email, invite_token, customer.name, customer=True):
            db.rollback()
            raise HTTPException(503, "Email delivery is not configured; portal invitation was not created")
        db.commit()
    except HTTPException:
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "This email already has an account") from exc
    except Exception:
        db.rollback()
        raise
    log_activity(db, user_id=actor.id, action="customer_invited", entity_type="customer", entity_id=customer.id)
    db.commit()
    return {"message": "Portal invitation sent", "customer_id": str(customer.id)}
