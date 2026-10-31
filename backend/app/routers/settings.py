from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.settings import BusinessSetting
from app.models.user import User

router = APIRouter(prefix="/api/settings", tags=["settings"])


class BusinessSettingsInput(BaseModel):
    business_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = None
    currency: str = Field(default="INR", min_length=3, max_length=10)
    timezone: str = Field(default="Asia/Kolkata", max_length=100)
    invoice_prefix: str = Field(default="INV", min_length=1, max_length=20)
    subscription_prefix: str = Field(default="SUB", min_length=1, max_length=20)
    default_payment_terms: int = Field(default=15, ge=0, le=365)
    auto_generate_invoices: bool = False
    send_renewal_reminders: bool = False
    auto_close_expired: bool = False


class BusinessSettingsPatch(BaseModel):
    business_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=10)
    timezone: str | None = Field(default=None, max_length=100)
    invoice_prefix: str | None = Field(default=None, min_length=1, max_length=20)
    subscription_prefix: str | None = Field(default=None, min_length=1, max_length=20)
    default_payment_terms: int | None = Field(default=None, ge=0, le=365)
    auto_generate_invoices: bool | None = None
    send_renewal_reminders: bool | None = None
    auto_close_expired: bool | None = None


class ProfileInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    company: str | None = Field(default=None, max_length=150)


@router.get("")
def get_settings(db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    value = db.query(BusinessSetting).first()
    if not value:
        return {"business_name": None, "email": None, "phone": None, "address": None, "currency": "INR", "timezone": "Asia/Kolkata", "invoice_prefix": "INV", "subscription_prefix": "SUB", "default_payment_terms": 15, "auto_generate_invoices": False, "send_renewal_reminders": False, "auto_close_expired": False}
    return {"business_name": value.business_name, "email": value.email, "phone": value.phone, "address": value.address, "currency": value.currency,
        "timezone": value.timezone, "invoice_prefix": value.invoice_prefix, "subscription_prefix": value.subscription_prefix, "default_payment_terms": value.default_payment_terms,
        "auto_generate_invoices": value.auto_generate_invoices, "send_renewal_reminders": value.send_renewal_reminders, "auto_close_expired": value.auto_close_expired}


@router.patch("")
def update_settings(payload: BusinessSettingsPatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    value = db.query(BusinessSetting).first()
    if not value:
        value = BusinessSetting(**payload.model_dump(exclude_unset=True))
        db.add(value)
    else:
        for key, item in payload.model_dump(exclude_unset=True).items():
            setattr(value, key, item)
    db.commit()
    db.refresh(value)
    return get_settings(db, _=None)


@router.get("/profile")
def get_profile(user: User = Depends(get_current_user)):
    return {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role}


@router.patch("/profile")
def update_profile(payload: ProfileInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    email = str(payload.email).lower()
    conflict = db.query(User.id).filter(User.email == email, User.id != user.id).first()
    if conflict:
        raise HTTPException(409, "An account with this email already exists")
    user.name = payload.name.strip()
    user.email = email
    if user.customer_id:
        customer = user.customer
        customer.name = user.name
        customer.email = email
        customer.phone = payload.phone
        customer.company = payload.company
    db.commit()
    return {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role}
