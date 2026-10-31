from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.discount import Discount, DiscountProductRule
from app.models.product import Product
from app.models.user import User

router = APIRouter(prefix="/api/discounts", tags=["discounts"])


class DiscountInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    code: str = Field(min_length=3, max_length=50)
    description: str | None = None
    discount_type: str
    value: Decimal = Field(gt=0)
    minimum_quantity: int = Field(default=0, ge=0)
    minimum_purchase: Decimal = Field(default=Decimal("0"), ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool = True
    product_ids: list[UUID] | None = None

    @field_validator("discount_type")
    @classmethod
    def validate_rules(cls, value):
        if value not in {"percentage", "fixed"}:
            raise ValueError("discount_type must be percentage or fixed")
        return value


class DiscountOutput(BaseModel):
    id: UUID
    name: str
    code: str | None
    description: str | None
    discount_type: str
    value: Decimal
    minimum_quantity: int | None
    minimum_purchase: Decimal | None
    usage_limit: int | None
    usage_count: int | None
    valid_from: datetime | None
    valid_until: datetime | None
    is_active: bool | None
    model_config = ConfigDict(from_attributes=True)


class DiscountPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    code: str | None = Field(default=None, min_length=3, max_length=50)
    description: str | None = None
    discount_type: str | None = None
    value: Decimal | None = Field(default=None, gt=0)
    minimum_quantity: int | None = Field(default=None, ge=0)
    minimum_purchase: Decimal | None = Field(default=None, ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool | None = None
    product_ids: list[UUID] | None = None

    @field_validator("discount_type")
    @classmethod
    def validate_type(cls, value):
        if value is not None and value not in {"percentage", "fixed"}:
            raise ValueError("discount_type must be percentage or fixed")
        return value


@router.get("")
def list_discounts(q: str | None = None, active: bool | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    query = db.query(Discount)
    if q:
        query = query.filter(Discount.name.ilike(f"%{q}%"))
    if active is not None:
        query = query.filter(Discount.is_active.is_(active))
    total = query.count()
    rows = query.order_by(Discount.name).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [DiscountOutput.model_validate(d).model_dump(mode="json") | {"product_ids": [str(r.product_id) for r in d.product_rules]} for d in rows], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_discount(payload: DiscountInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    if payload.discount_type not in {"percentage", "fixed"}:
        raise HTTPException(422, "discount_type must be percentage or fixed")
    if payload.valid_from and payload.valid_until and payload.valid_until <= payload.valid_from:
        raise HTTPException(422, "valid_until must be later than valid_from")
    data = payload.model_dump(exclude={"product_ids"})
    data["code"] = payload.code.strip().upper()
    item = Discount(**data)
    db.add(item)
    db.flush()
    product_ids = payload.product_ids or []
    valid_products = db.query(Product.id).filter(Product.id.in_(product_ids), Product.status == "active").all() if product_ids else []
    if len(valid_products) != len(set(product_ids)):
        raise HTTPException(422, "Applicable product IDs must refer to active products")
    item.product_rules = [DiscountProductRule(product_id=pid) for pid in set(product_ids)]
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Discount code already exists") from exc
    db.refresh(item)
    return DiscountOutput.model_validate(item).model_dump(mode="json") | {"product_ids": [str(r.product_id) for r in item.product_rules]}


@router.patch("/{discount_id}")
def update_discount(discount_id: UUID, payload: DiscountPatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    item = db.get(Discount, discount_id)
    if not item:
        raise HTTPException(404, "Discount not found")
    data = payload.model_dump(exclude_unset=True)
    product_ids = data.pop("product_ids", None)
    if "code" in data and data["code"]:
        data["code"] = data["code"].strip().upper()
    for key, value in data.items():
        setattr(item, key, value)
    if product_ids is not None:
        valid_products = db.query(Product.id).filter(Product.id.in_(product_ids), Product.status == "active").all() if product_ids else []
        if len(valid_products) != len(set(product_ids)):
            raise HTTPException(422, "Applicable product IDs must refer to active products")
        item.product_rules = [DiscountProductRule(product_id=pid) for pid in set(product_ids)]
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Discount code already exists") from exc
    return DiscountOutput.model_validate(item).model_dump(mode="json") | {"product_ids": [str(r.product_id) for r in item.product_rules]}


@router.delete("/{discount_id}")
def deactivate_discount(discount_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    item = db.get(Discount, discount_id)
    if not item:
        raise HTTPException(404, "Discount not found")
    item.is_active = False
    db.commit()
    return {"message": "Discount deactivated"}


@router.post("/validate")
def validate_discount(code: str, subtotal: Decimal = Query(ge=0), quantity: int = Query(1, ge=1), db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.query(Discount).filter(Discount.code.ilike(code.strip()), Discount.is_active.is_(True)).with_for_update().first()
    now = datetime.now(timezone.utc)
    if not item or (item.valid_from and item.valid_from > now) or (item.valid_until and item.valid_until <= now):
        raise HTTPException(422, "Discount code is invalid or expired")
    if item.usage_limit is not None and (item.usage_count or 0) >= item.usage_limit:
        raise HTTPException(422, "Discount usage limit reached")
    if quantity < (item.minimum_quantity or 0):
        raise HTTPException(422, "Minimum quantity requirement not met")
    if subtotal < (item.minimum_purchase or 0):
        raise HTTPException(422, "Minimum purchase requirement not met")
    amount = min(subtotal, subtotal * item.value / Decimal("100")) if item.discount_type == "percentage" else min(subtotal, item.value)
    return {"valid": True, "discount_id": str(item.id), "discount_amount": str(amount.quantize(Decimal("0.01")))}
