from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.plan import Plan
from app.models.product import Product
from app.models.user import User

router = APIRouter(prefix="/api/plans", tags=["plans"])


class PlanInput(BaseModel):
    product_id: UUID
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    billing_period: str
    billing_interval: int = Field(default=1, ge=1)
    price: Decimal = Field(ge=0)
    trial_days: int = Field(default=0, ge=0)
    minimum_quantity: int = Field(default=1, ge=1)
    is_pausable: bool = True
    is_renewable: bool = True
    auto_close: bool = False
    allows_early_closure: bool = True
    start_date: date | None = None
    end_date: date | None = None
    status: str = "active"

    @model_validator(mode="after")
    def valid_period(self):
        if self.billing_period.lower() not in {"daily", "weekly", "monthly", "yearly"}:
            raise ValueError("billing_period must be daily, weekly, monthly or yearly")
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class PlanOutput(BaseModel):
    id: UUID
    product_id: UUID
    name: str
    description: str | None
    billing_period: str
    billing_interval: int | None
    price: Decimal
    trial_days: int | None
    minimum_quantity: int
    is_pausable: bool | None
    is_renewable: bool | None
    auto_close: bool
    allows_early_closure: bool
    start_date: date | None
    end_date: date | None
    status: str | None
    model_config = ConfigDict(from_attributes=True)


class PlanPatch(BaseModel):
    product_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    billing_period: str | None = None
    billing_interval: int | None = Field(default=None, ge=1)
    price: Decimal | None = Field(default=None, ge=0)
    trial_days: int | None = Field(default=None, ge=0)
    minimum_quantity: int | None = Field(default=None, ge=1)
    is_pausable: bool | None = None
    is_renewable: bool | None = None
    auto_close: bool | None = None
    allows_early_closure: bool | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = None


@router.get("")
def list_plans(q: str | None = None, status_filter: str | None = Query(None, alias="status"), product_id: UUID | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Plan)
    if q:
        query = query.filter(or_(Plan.name.ilike(f"%{q}%"), Plan.description.ilike(f"%{q}%")))
    if status_filter:
        query = query.filter(Plan.status == status_filter)
    if product_id:
        query = query.filter(Plan.product_id == product_id)
    total = query.count()
    rows = query.order_by(Plan.name).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [PlanOutput.model_validate(p).model_dump(mode="json") for p in rows], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_plan(payload: PlanInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    product = db.query(Product).filter(Product.id == payload.product_id, Product.status == "active").first()
    if not product:
        raise HTTPException(422, "An active product is required")
    plan = Plan(**payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return PlanOutput.model_validate(plan).model_dump(mode="json")


@router.get("/{plan_id}")
def get_plan(plan_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    return PlanOutput.model_validate(plan).model_dump(mode="json")


@router.patch("/{plan_id}")
def update_plan(plan_id: UUID, payload: PlanPatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("billing_period") and data["billing_period"].lower() not in {"daily", "weekly", "monthly", "yearly"}:
        raise HTTPException(422, "billing_period must be daily, weekly, monthly or yearly")
    if data.get("product_id") and not db.query(Product.id).filter(Product.id == data["product_id"], Product.status == "active").first():
        raise HTTPException(422, "An active product is required")
    for key, value in data.items():
        setattr(plan, key, value)
    db.commit()
    return PlanOutput.model_validate(plan).model_dump(mode="json")


@router.delete("/{plan_id}")
def archive_plan(plan_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    plan.status = "archived"
    db.commit()
    return {"message": "Plan archived"}
