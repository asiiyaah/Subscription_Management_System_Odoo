import logging
import secrets
import smtplib
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.core.security import hash_password
from app.database.connection import get_db
from app.models.user import User
from app.routers.auth import create_password_reset_token
from app.schemas.user import UserResponse, validate_password_strength
from app.services.email_service import send_password_reset_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/users", tags=["users"])


class StaffCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    password: str | None = None
    role: str = "staff"
    send_invite: bool = False

    def validate_values(self):
        if self.role not in {"admin", "staff"}:
            raise HTTPException(422, "Only admin or staff accounts can be created here")
        if self.password:
            validate_password_strength(self.password)
        elif not self.send_invite:
            raise HTTPException(422, "Password is required unless send_invite is true")


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    role: str | None = None
    is_active: bool | None = None


def _user_dict(user: User):
    return UserResponse.model_validate(user).model_dump(mode="json") | {
        "is_active": bool(user.is_active),
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "customer_id": str(user.customer_id) if user.customer_id else None,
    }


def _send_invite(db: Session, user: User) -> bool:
    raw_token = create_password_reset_token(db, user)
    db.commit()
    try:
        return bool(send_password_reset_email(user.email, raw_token))
    except (OSError, smtplib.SMTPException) as exc:
        logger.warning("Password setup invitation failed for user %s (%s)", user.id, type(exc).__name__)
        return False


@router.get("")
def list_users(q: str | None = None, role: str | None = None, active: bool | None = None,
               include_customers: bool = False, page: int = Query(1, ge=1),
               page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db),
               _: User = Depends(require_roles("admin"))):
    query = db.query(User)
    if not include_customers:
        query = query.filter(User.role != "customer")
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(User.name.ilike(term), User.email.ilike(term)))
    if role:
        query = query.filter(User.role == role)
    if active is not None:
        query = query.filter(User.is_active.is_(active))
    total = query.count()
    rows = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_user_dict(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/counts")
def user_counts(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    rows = db.query(User.role, User.is_active, func.count(User.id)).group_by(User.role, User.is_active).all()
    totals = {"admin": 0, "staff": 0, "customer": 0, "active": 0, "disabled": 0}
    for role, active, count in rows:
        totals[role] = totals.get(role, 0) + int(count)
        totals["active" if active else "disabled"] += int(count)
    return totals


@router.post("", status_code=201)
def create_user(payload: StaffCreate, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    payload.validate_values()
    password = payload.password or secrets.token_urlsafe(48)
    user = User(name=payload.name.strip(), email=str(payload.email).lower(),
        password_hash=hash_password(password), role=payload.role, is_active=True)
    db.add(user)
    try:
        db.flush()
        invited = _send_invite(db, user) if payload.send_invite else False
        if not payload.send_invite:
            db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists") from exc
    db.refresh(user)
    return _user_dict(user) | {"invite_sent": invited}


@router.patch("/{user_id}")
def update_user(user_id: UUID, payload: UserUpdate, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("role") and data["role"] not in {"admin", "staff", "customer"}:
        raise HTTPException(422, "Role must be admin, staff, or customer")
    if data.get("role") == "customer" and not target.customer_id:
        raise HTTPException(422, "A customer profile is required before assigning the customer role")
    if target.id == actor.id and (data.get("role", target.role) != "admin" or data.get("is_active", True) is False):
        raise HTTPException(409, "You cannot remove your own admin access")
    if target.role == "admin" and (data.get("role", "admin") != "admin" or data.get("is_active") is False):
        admins = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count()
        if admins <= 1:
            raise HTTPException(409, "The last active administrator cannot be disabled or demoted")
    for key, value in data.items():
        setattr(target, key, value)
    db.commit()
    db.refresh(target)
    return _user_dict(target)


@router.post("/{user_id}/password-reset")
def send_user_password_reset(user_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if not user.is_active:
        raise HTTPException(409, "Cannot send a password reset to a disabled account")
    sent = _send_invite(db, user)
    return {"message": "Password reset email sent" if sent else "Password reset token created; email delivery is not configured", "sent": sent}
