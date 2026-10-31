from uuid import UUID
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import or_
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
from app.services.email_service import send_password_reset_email
from app.services.activity_service import log_activity
from app.models.user import PasswordResetToken
from app.core.security import hash_password
from app.services.email_service import send_password_reset_email

router = APIRouter(prefix="/api/customers", tags=["customers"])


class CustomerInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    company: str | None = Field(default=None, max_length=150)
    address: str | None = None
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
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    is_active: bool | None = None


@router.get("")
def list_customers(q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    query = db.query(Customer)
    if q:
        query = query.filter(or_(Customer.name.ilike(f"%{q}%"), Customer.email.ilike(f"%{q}%"), Customer.company.ilike(f"%{q}%")))
    total = query.count()
    rows = query.order_by(Customer.name).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [CustomerOutput.model_validate(c).model_dump(mode="json") for c in rows], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_customer(payload: CustomerInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    customer = Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return CustomerOutput.model_validate(customer).model_dump(mode="json")


@router.get("/{customer_id}")
def get_customer(customer_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    data = CustomerOutput.model_validate(customer).model_dump(mode="json")
    data.update({"subscriptions": [{"id": str(s.id), "subscription_number": s.subscription_number, "status": s.status, "total": str(s.total or 0)} for s in customer.subscriptions],
                 "invoices": [{"id": str(i.id), "invoice_number": i.invoice_number, "status": i.status, "total": str(i.total or 0), "balance_due": str(i.balance_due or 0)} for i in customer.invoices],
                 "payments": [{"id": str(p.id), "amount": str(p.amount), "payment_date": p.payment_date.isoformat() if p.payment_date else None, "payment_method": p.payment_method} for p in customer.payments]})
    entity_ids = [s.id for s in customer.subscriptions] + [i.id for i in customer.invoices] + [p.id for p in customer.payments]
    logs = db.query(ActivityLog).filter(ActivityLog.entity_id.in_(entity_ids)).order_by(ActivityLog.created_at.desc()).limit(50).all() if entity_ids else []
    data["activity"] = [{"action": a.action, "entity_type": a.entity_type, "description": a.description, "created_at": a.created_at.isoformat() if a.created_at else None} for a in logs]
    return data


@router.patch("/{customer_id}")
def update_customer(customer_id: UUID, payload: CustomerPatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "email" and value is not None:
            value = str(value).lower()
        setattr(customer, key, value)
    db.commit()
    return CustomerOutput.model_validate(customer).model_dump(mode="json")


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
    reset_token = secrets.token_urlsafe(32)
    user = User(name=customer.name, email=customer.email.lower(), password_hash=hash_password(secrets.token_urlsafe(48)), role="customer", is_active=True, customer_id=customer.id)
    db.add(user)
    try:
        db.flush()
        db.add(PasswordResetToken(user_id=user.id, token_hash=hashlib.sha256(reset_token.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)))
        if not send_password_reset_email(user.email, reset_token):
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
