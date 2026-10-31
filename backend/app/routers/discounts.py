from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.discount import Discount, DiscountProductRule, DiscountUsage
from app.models.product import Product
from app.models.user import User

router = APIRouter(prefix="/api/discounts", tags=["discounts"])


class DiscountInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    code: str = Field(min_length=3, max_length=50)
    description: str | None = None
    discount_type: str = Field(validation_alias=AliasChoices("type", "discount_type"))
    value: Decimal = Field(gt=0)
    minimum_quantity: int = Field(default=0, ge=0, validation_alias=AliasChoices("min_quantity", "minimum_quantity"))
    minimum_purchase: Decimal = Field(default=Decimal("0"), ge=0, validation_alias=AliasChoices("min_purchase", "minimum_purchase"))
    usage_limit: int | None = Field(default=None, ge=1)
    valid_from: datetime | None = Field(default=None, validation_alias=AliasChoices("start_date", "valid_from"))
    valid_until: datetime | None = Field(default=None, validation_alias=AliasChoices("end_date", "valid_until"))
    is_active: bool = Field(default=True, validation_alias=AliasChoices("active", "is_active"))
    product_ids: list[UUID] | None = None
    applies_to: str = "subscription"

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
    discount_type: str | None = Field(default=None, validation_alias=AliasChoices("type", "discount_type"))
    value: Decimal | None = Field(default=None, gt=0)
    minimum_quantity: int | None = Field(default=None, ge=0, validation_alias=AliasChoices("min_quantity", "minimum_quantity"))
    minimum_purchase: Decimal | None = Field(default=None, ge=0, validation_alias=AliasChoices("min_purchase", "minimum_purchase"))
    usage_limit: int | None = Field(default=None, ge=1)
    valid_from: datetime | None = Field(default=None, validation_alias=AliasChoices("start_date", "valid_from"))
    valid_until: datetime | None = Field(default=None, validation_alias=AliasChoices("end_date", "valid_until"))
    is_active: bool | None = Field(default=None, validation_alias=AliasChoices("active", "is_active"))
    product_ids: list[UUID] | None = None
    applies_to: str | None = None

    @field_validator("discount_type")
    @classmethod
    def validate_type(cls, value):
        if value is not None and value not in {"percentage", "fixed"}:
            raise ValueError("discount_type must be percentage or fixed")
        return value


class DiscountValidationInput(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    subtotal: Decimal = Field(ge=0)
    quantity: int = Field(default=1, ge=1)
    product_ids: list[UUID] = []


def _discount_status(discount: Discount):
    now = datetime.now(timezone.utc)
    if not discount.is_active:
        return "inactive"
    if discount.usage_limit is not None and (discount.usage_count or 0) >= discount.usage_limit:
        return "used_up"
    if discount.valid_until and discount.valid_until <= now:
        return "expired"
    if discount.valid_from and discount.valid_from > now:
        return "scheduled"
    return "active"


def _discount_dict(discount: Discount):
    data = DiscountOutput.model_validate(discount).model_dump(mode="json")
    product_ids = [str(rule.product_id) for rule in discount.product_rules]
    product_names = [rule.product.name for rule in discount.product_rules if rule.product]
    status = _discount_status(discount)
    return data | {"type": discount.discount_type, "min_purchase": float(discount.minimum_purchase or 0),
        "min_quantity": int(discount.minimum_quantity or 0),
        "start_date": discount.valid_from.date().isoformat() if discount.valid_from else "",
        "end_date": discount.valid_until.date().isoformat() if discount.valid_until else None,
        "used_count": int(discount.usage_count or 0), "applies_to": "products" if product_ids else "subscription",
        "product_ids": product_ids, "product_names": product_names, "active": bool(discount.is_active), "status": status}


@router.get("")
def list_discounts(q: str | None = None, search: str | None = None, status: str | None = None,
                   active: bool | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    query = db.query(Discount).options(selectinload(Discount.product_rules).joinedload(DiscountProductRule.product))
    term = q or search
    if term:
        query = query.filter(or_(Discount.name.ilike(f"%{term}%"), Discount.code.ilike(f"%{term}%")))
    if active is not None:
        query = query.filter(Discount.is_active.is_(active))
    if status:
        rows = [row for row in query.order_by(Discount.name).all() if _discount_status(row) == status]
        total = len(rows)
        rows = rows[(page - 1) * page_size:page * page_size]
    else:
        total = query.count()
        rows = query.order_by(Discount.name).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_discount_dict(d) for d in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/counts")
def discount_counts(db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    values = db.query(Discount).all()
    result = {key: 0 for key in ("all", "active", "scheduled", "expired", "used_up", "inactive")}
    result["all"] = len(values)
    for item in values:
        result[_discount_status(item)] += 1
    return result


@router.post("", status_code=201)
def create_discount(payload: DiscountInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    if payload.discount_type not in {"percentage", "fixed"}:
        raise HTTPException(422, "discount_type must be percentage or fixed")
    if payload.valid_from and payload.valid_until and payload.valid_until <= payload.valid_from:
        raise HTTPException(422, "valid_until must be later than valid_from")
    if payload.applies_to not in {"subscription", "products"}:
        raise HTTPException(422, "applies_to must be subscription or products")
    if payload.applies_to == "products" and not payload.product_ids:
        raise HTTPException(422, "Select at least one applicable product")
    data = payload.model_dump(exclude={"product_ids", "applies_to"})
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
    return _discount_dict(item)


@router.patch("/{discount_id}")
@router.put("/{discount_id}")
def update_discount(discount_id: UUID, payload: DiscountPatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    item = db.get(Discount, discount_id)
    if not item:
        raise HTTPException(404, "Discount not found")
    data = payload.model_dump(exclude_unset=True, exclude={"product_ids", "applies_to"})
    product_ids = payload.product_ids
    if payload.applies_to is not None and payload.applies_to not in {"subscription", "products"}:
        raise HTTPException(422, "applies_to must be subscription or products")
    if payload.applies_to == "products" and product_ids == []:
        raise HTTPException(422, "Select at least one applicable product")
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
    return _discount_dict(item)


@router.delete("/{discount_id}")
def deactivate_discount(discount_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    item = db.get(Discount, discount_id)
    if not item:
        raise HTTPException(404, "Discount not found")
    used = db.query(DiscountUsage.id).filter(DiscountUsage.discount_id == item.id).first()
    if used or (item.usage_count or 0) > 0:
        raise HTTPException(409, "A discount that has already been used cannot be deleted")
    db.delete(item)
    db.commit()
    return {"message": "Discount deleted"}


@router.post("/validate")
def validate_discount(payload: DiscountValidationInput | None = Body(default=None), code: str | None = None,
                      subtotal: Decimal | None = Query(default=None, ge=0), quantity: int = Query(1, ge=1),
                      product_ids: list[UUID] | None = Query(default=None), db: Session = Depends(get_db),
                      _: User = Depends(get_current_user)):
    try:
        request = payload or DiscountValidationInput(code=code, subtotal=subtotal, quantity=quantity, product_ids=product_ids or [])
    except Exception:
        raise HTTPException(422, "code and subtotal are required")
    item = db.query(Discount).options(selectinload(Discount.product_rules)).filter(
        Discount.code.ilike(request.code.strip()), Discount.is_active.is_(True)).with_for_update().first()
    now = datetime.now(timezone.utc)
    if not item or (item.valid_from and item.valid_from > now) or (item.valid_until and item.valid_until <= now):
        return {"valid": False, "reason": "Discount code is invalid or expired"}
    if item.usage_limit is not None and (item.usage_count or 0) >= item.usage_limit:
        return {"valid": False, "reason": "Discount usage limit reached"}
    if request.quantity < (item.minimum_quantity or 0):
        return {"valid": False, "reason": "Minimum quantity requirement not met"}
    if request.subtotal < (item.minimum_purchase or 0):
        return {"valid": False, "reason": "Minimum purchase requirement not met"}
    applicable_ids = {rule.product_id for rule in item.product_rules}
    if applicable_ids and not applicable_ids.intersection(request.product_ids):
        return {"valid": False, "reason": "Discount does not apply to the selected products"}
    amount = min(request.subtotal, request.subtotal * item.value / Decimal("100")) if item.discount_type == "percentage" else min(request.subtotal, item.value)
    discount_data = {"id": str(item.id), "code": item.code, "name": item.name, "type": item.discount_type,
        "value": float(item.value), "applies_to": "products" if applicable_ids else "subscription",
        "product_ids": [str(pid) for pid in applicable_ids]}
    return {"valid": True, "discount": discount_data, "discount_id": str(item.id),
        "discount_amount": float(amount.quantize(Decimal("0.01")))}
