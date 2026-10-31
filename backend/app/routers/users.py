from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.core.security import hash_password
from app.database.connection import get_db
from app.models.user import User
from app.schemas.user import UserResponse, validate_password_strength

router = APIRouter(prefix="/api/users", tags=["users"])


class StaffCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    password: str
    role: str = "staff"

    def validate_values(self):
        validate_password_strength(self.password)
        if self.role not in {"admin", "staff"}:
            raise HTTPException(422, "Only admin or staff accounts can be created here")


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    role: str | None = None
    is_active: bool | None = None


@router.get("")
def list_users(q: str | None = None, role: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    query = db.query(User)
    if q:
        query = query.filter(or_(User.name.ilike(f"%{q}%"), User.email.ilike(f"%{q}%")))
    if role:
        query = query.filter(User.role == role)
    total = query.count()
    rows = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [UserResponse.model_validate(x).model_dump(mode="json") | {"is_active": x.is_active} for x in rows], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_user(payload: StaffCreate, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    payload.validate_values()
    user = User(name=payload.name.strip(), email=str(payload.email).lower(), password_hash=hash_password(payload.password), role=payload.role, is_active=True)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists") from exc
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/{user_id}")
def update_user(user_id: UUID, payload: UserUpdate, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("role") and data["role"] not in {"admin", "staff", "customer"}:
        raise HTTPException(422, "Role must be admin, staff, or customer")
    if target.id == actor.id and (data.get("role", target.role) != "admin" or data.get("is_active", True) is False):
        raise HTTPException(409, "You cannot remove your own admin access")
    if target.role == "admin" and (data.get("role", "admin") != "admin" or data.get("is_active") is False):
        admins = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count()
        if admins <= 1:
            raise HTTPException(409, "The last active administrator cannot be disabled or demoted")
    for key, value in data.items():
        setattr(target, key, value)
    db.commit()
    return UserResponse.model_validate(target).model_dump(mode="json") | {"is_active": target.is_active}
