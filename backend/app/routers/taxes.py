from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.tax import Tax
from app.models.user import User

router = APIRouter(prefix="/api/taxes", tags=["taxes"])


class TaxInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    tax_type: str
    rate: Decimal = Field(ge=0)
    is_active: bool = True
    is_default: bool = False

    @field_validator("tax_type")
    @classmethod
    def validate_type(cls, value):
        if value not in {"percentage", "fixed"}:
            raise ValueError("tax_type must be percentage or fixed")
        return value


class TaxOutput(BaseModel):
    id: UUID
    name: str
    tax_type: str
    rate: Decimal
    is_active: bool | None
    is_default: bool
    model_config = ConfigDict(from_attributes=True)


class TaxPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    tax_type: str | None = None
    rate: Decimal | None = Field(default=None, ge=0)
    is_active: bool | None = None
    is_default: bool | None = None

    @field_validator("tax_type")
    @classmethod
    def validate_type(cls, value):
        if value is not None and value not in {"percentage", "fixed"}:
            raise ValueError("tax_type must be percentage or fixed")
        return value


@router.get("")
def list_taxes(active: bool | None = None, page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=200), db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    q = db.query(Tax)
    if active is not None:
        q = q.filter(Tax.is_active.is_(active))
    total = q.count()
    rows = q.order_by(Tax.name).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [TaxOutput.model_validate(t).model_dump(mode="json") for t in rows], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_tax(payload: TaxInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    if payload.is_default:
        db.query(Tax).update({Tax.is_default: False}, synchronize_session=False)
    tax = Tax(**payload.model_dump())
    db.add(tax)
    db.commit()
    db.refresh(tax)
    return TaxOutput.model_validate(tax).model_dump(mode="json")


@router.patch("/{tax_id}")
def update_tax(tax_id: UUID, payload: TaxPatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    tax = db.get(Tax, tax_id)
    if not tax:
        raise HTTPException(404, "Tax not found")
    if payload.is_default:
        db.query(Tax).filter(Tax.id != tax.id).update({Tax.is_default: False}, synchronize_session=False)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tax, key, value)
    db.commit()
    return TaxOutput.model_validate(tax).model_dump(mode="json")


@router.delete("/{tax_id}")
def deactivate_tax(tax_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    tax = db.get(Tax, tax_id)
    if not tax:
        raise HTTPException(404, "Tax not found")
    tax.is_active = False
    db.commit()
    return {"message": "Tax deactivated"}
