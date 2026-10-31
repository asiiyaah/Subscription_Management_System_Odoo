from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.tax import Tax
from app.models.product import Product, ProductTaxRule
from app.models.user import User

router = APIRouter(prefix="/api/taxes", tags=["taxes"])


class TaxInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    tax_type: str = Field(validation_alias=AliasChoices("type", "tax_type"))
    rate: Decimal = Field(ge=0)
    is_active: bool = Field(default=True, validation_alias=AliasChoices("active", "is_active"))
    is_default: bool = False
    applies_to: str = "all"
    product_ids: list[UUID] = []

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
    tax_type: str | None = Field(default=None, validation_alias=AliasChoices("type", "tax_type"))
    rate: Decimal | None = Field(default=None, ge=0)
    is_active: bool | None = Field(default=None, validation_alias=AliasChoices("active", "is_active"))
    is_default: bool | None = None
    applies_to: str | None = None
    product_ids: list[UUID] | None = None

    @field_validator("tax_type")
    @classmethod
    def validate_type(cls, value):
        if value is not None and value not in {"percentage", "fixed"}:
            raise ValueError("tax_type must be percentage or fixed")
        return value


def _tax_dict(tax: Tax):
    rules = list(tax.product_rules or [])
    products = [rule.product for rule in rules if rule.product]
    data = TaxOutput.model_validate(tax).model_dump(mode="json")
    return data | {"type": tax.tax_type, "active": bool(tax.is_active),
        "applies_to": "products" if rules else "all", "product_ids": [str(p.id) for p in products],
        "product_names": [p.name for p in products]}


@router.get("")
def list_taxes(active: bool | None = None, page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=200), db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    q = db.query(Tax).options(selectinload(Tax.product_rules).joinedload(ProductTaxRule.product))
    if active is not None:
        q = q.filter(Tax.is_active.is_(active))
    return [_tax_dict(t) for t in q.order_by(Tax.is_default.desc(), Tax.name).all()]


@router.post("", status_code=201)
def create_tax(payload: TaxInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    if payload.applies_to not in {"all", "products"}:
        raise HTTPException(422, "applies_to must be all or products")
    if payload.applies_to == "products" and not payload.product_ids:
        raise HTTPException(422, "Select at least one product for a product-specific tax")
    products = db.query(Product.id).filter(Product.id.in_(payload.product_ids), Product.status == "active").all() if payload.product_ids else []
    if len(products) != len(set(payload.product_ids)):
        raise HTTPException(422, "Applicable product IDs must refer to active products")
    if payload.is_default:
        db.query(Tax).update({Tax.is_default: False}, synchronize_session=False)
    tax = Tax(name=payload.name, tax_type=payload.tax_type, rate=payload.rate, is_active=payload.is_active, is_default=payload.is_default)
    tax.product_rules = [ProductTaxRule(product_id=product_id) for product_id in set(payload.product_ids)]
    db.add(tax)
    db.commit()
    db.refresh(tax)
    return _tax_dict(tax)


@router.patch("/{tax_id}")
@router.put("/{tax_id}")
def update_tax(tax_id: UUID, payload: TaxPatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    tax = db.get(Tax, tax_id)
    if not tax:
        raise HTTPException(404, "Tax not found")
    if tax.is_default and payload.is_active is False:
        raise HTTPException(422, "Make another tax the default first.")
    if payload.is_default:
        db.query(Tax).filter(Tax.id != tax.id).update({Tax.is_default: False}, synchronize_session=False)
    data = payload.model_dump(exclude_unset=True, exclude={"product_ids", "applies_to"})
    for key, value in data.items():
        setattr(tax, key, value)
    if payload.product_ids is not None:
        valid = db.query(Product.id).filter(Product.id.in_(payload.product_ids), Product.status == "active").all() if payload.product_ids else []
        if len(valid) != len(set(payload.product_ids)):
            raise HTTPException(422, "Applicable product IDs must refer to active products")
        if payload.applies_to == "products" and not payload.product_ids:
            raise HTTPException(422, "Select at least one product for a product-specific tax")
        db.query(ProductTaxRule).filter(ProductTaxRule.tax_id == tax.id).delete(synchronize_session=False)
        tax.product_rules = [ProductTaxRule(product_id=pid) for pid in set(payload.product_ids)]
    db.commit()
    return _tax_dict(tax)


@router.post("/{tax_id}/default")
def set_default_tax(tax_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    tax = db.get(Tax, tax_id)
    if not tax:
        raise HTTPException(404, "Tax not found")
    if not tax.is_active:
        raise HTTPException(422, "An inactive tax cannot be the default")
    db.query(Tax).filter(Tax.id != tax.id).update({Tax.is_default: False}, synchronize_session=False)
    tax.is_default = True
    db.commit()
    return _tax_dict(tax)


@router.delete("/{tax_id}")
def deactivate_tax(tax_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    tax = db.get(Tax, tax_id)
    if not tax:
        raise HTTPException(404, "Tax not found")
    if tax.is_default:
        raise HTTPException(422, "Make another tax the default first.")
    tax.is_active = False
    db.commit()
    return {"message": "Tax deactivated"}
