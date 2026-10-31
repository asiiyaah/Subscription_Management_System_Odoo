from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.customer import Customer
from app.models.discount import Discount, DiscountUsage
from app.models.plan import Plan
from app.models.product import Product, ProductAttributeValue, ProductTaxRule
from app.models.subscription import Subscription, SubscriptionHistory, SubscriptionLine
from app.models.tax import Tax
from app.models.user import User
from app.services.pricing_service import PriceLineInput, calculate_pricing
from app.services.subscription_service import transition_subscription
from app.services.subscription_service import next_billing_date
from app.services.activity_service import log_activity
from app.models.settings import BusinessSetting
import uuid

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


class LineInput(BaseModel):
    product_id: UUID
    plan_id: UUID | None = None
    product_attribute_value_id: UUID | None = None
    quantity: Decimal = Field(default=Decimal("1"), gt=0)


class SubscriptionInput(BaseModel):
    customer_id: UUID
    lines: list[LineInput] = Field(min_length=1)
    notes: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    discount_id: UUID | None = None
    quotation_template_id: UUID | None = None
    quotation_valid_until: date | None = None
    status: str = "draft"

    @model_validator(mode="after")
    def valid_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


def _price_lines(db: Session, entries: list[LineInput], discount: Discount | None = None):
    requests = []
    lines = []
    for entry in entries:
        product = db.get(Product, entry.product_id)
        if not product or product.status != "active":
            raise HTTPException(422, "Each subscription line must use an active product")
        plan = db.get(Plan, entry.plan_id) if entry.plan_id else None
        if plan and (plan.product_id != product.id or plan.status != "active"):
            raise HTTPException(422, "Plan must be active and belong to the selected product")
        if plan and entry.quantity < (plan.minimum_quantity or 1):
            raise HTTPException(422, f"Quantity for plan {plan.name} must be at least {plan.minimum_quantity}")
        if plan and plan.start_date and plan.start_date > date.today():
            raise HTTPException(422, "Plan is not available yet")
        if plan and plan.end_date and plan.end_date < date.today():
            raise HTTPException(422, "Plan is no longer available")
        variant = db.get(ProductAttributeValue, entry.product_attribute_value_id) if entry.product_attribute_value_id else None
        if variant and variant.attribute.product_id != product.id:
            raise HTTPException(422, "Variant does not belong to the selected product")
        specific_tax_ids = [r[0] for r in db.query(ProductTaxRule.tax_id).filter(ProductTaxRule.product_id == product.id).all()]
        taxes_query = db.query(Tax).filter(Tax.is_active.is_(True))
        if specific_tax_ids:
            taxes_query = taxes_query.filter((Tax.id.in_(specific_tax_ids)) | (Tax.is_default.is_(True)))
        else:
            taxes_query = taxes_query.filter(Tax.is_default.is_(True))
        taxes = taxes_query.all()
        pct = tuple(Decimal(str(t.rate)) for t in taxes if t.tax_type == "percentage")
        fixed = sum((Decimal(str(t.rate)) for t in taxes if t.tax_type == "fixed"), Decimal("0"))
        unit_price = Decimal(str(plan.price if plan else product.sales_price))
        applicable_ids = {r.product_id for r in discount.product_rules} if discount else set()
        requests.append(PriceLineInput(unit_price=unit_price, quantity=entry.quantity,
            extra_price=Decimal(str(variant.extra_price or 0)) if variant else Decimal("0"),
            fixed_tax_per_unit=fixed, percentage_tax_rates=pct,
            discount_eligible=not applicable_ids or product.id in applicable_ids))
        lines.append((product, plan, variant))
    priced = calculate_pricing(requests,
        discount_type=discount.discount_type if discount else None,
        discount_value=Decimal(str(discount.value)) if discount else Decimal("0"))
    if discount:
        total_quantity = sum((line.quantity for line in entries), Decimal("0"))
        eligible_purchase = sum(((request.unit_price + request.extra_price) * request.quantity for request in requests if request.discount_eligible), Decimal("0"))
        if total_quantity < (discount.minimum_quantity or 0):
            raise HTTPException(422, "Discount minimum quantity requirement not met")
        if eligible_purchase < Decimal(str(discount.minimum_purchase or 0)):
            raise HTTPException(422, "Discount minimum purchase requirement not met")
    return priced, lines


def _discount(db: Session, discount_id: UUID | None):
    if not discount_id:
        return None
    discount = db.query(Discount).filter(Discount.id == discount_id).with_for_update().first()
    if not discount or not discount.is_active:
        raise HTTPException(422, "Discount is unavailable")
    if discount.usage_limit is not None and (discount.usage_count or 0) >= discount.usage_limit:
        raise HTTPException(422, "Discount usage limit reached")
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if discount.valid_from and discount.valid_from > now or discount.valid_until and discount.valid_until <= now:
        raise HTTPException(422, "Discount is not currently valid")
    return discount


@router.post("/preview")
def preview_subscription(payload: SubscriptionInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "customer" and payload.customer_id != user.customer_id:
        raise HTTPException(403, "You may only preview your own subscription")
    discount = _discount(db, payload.discount_id)
    priced, _ = _price_lines(db, payload.lines, discount)
    return {"subtotal": str(priced.subtotal), "discount_total": str(priced.discount), "tax_total": str(priced.tax), "total": str(priced.total),
            "lines": [{"quantity": str(x.quantity), "unit_price": str(x.unit_price), "subtotal": str(x.subtotal), "discount": str(x.discount), "tax": str(x.tax), "total": str(x.total)} for x in priced.lines]}


@router.post("", status_code=201)
def create_subscription(payload: SubscriptionInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "customer" and (payload.customer_id != user.customer_id or payload.status != "draft"):
        raise HTTPException(403, "Customers may create only their own draft subscriptions")
    customer = db.get(Customer, payload.customer_id)
    if not customer or not customer.is_active:
        raise HTTPException(422, "An active customer is required")
    if payload.status not in {"draft", "quotation"} or (user.role == "customer" and payload.status != "draft"):
        raise HTTPException(422, "New subscriptions must start in draft or quotation status")
    discount = _discount(db, payload.discount_id)
    priced, references = _price_lines(db, payload.lines, discount)
    settings = db.query(BusinessSetting).first()
    prefix = settings.subscription_prefix if settings and settings.subscription_prefix else "SUB"
    number = f"{prefix}-{date.today():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
    first_plan = next((p for _, p, _ in references if p), None)
    sub = Subscription(subscription_number=number, customer_id=customer.id, quotation_template_id=payload.quotation_template_id,
        quotation_valid_until=payload.quotation_valid_until, status=payload.status,
        start_date=payload.start_date, end_date=payload.end_date,
        billing_period=first_plan.billing_period if first_plan else "monthly",
        billing_interval=first_plan.billing_interval if first_plan else 1,
        subtotal=priced.subtotal, discount_total=priced.discount, tax_total=priced.tax,
        total=priced.total, notes=payload.notes, created_by=user.id)
    for (entry, (product, plan, variant), calculated) in zip(payload.lines, references, priced.lines):
        sub.lines.append(SubscriptionLine(product_id=product.id, plan_id=plan.id if plan else None,
            product_attribute_value_id=variant.id if variant else None, description=product.name,
            quantity=entry.quantity, unit_price=calculated.unit_price, discount_amount=calculated.discount,
            tax_amount=calculated.tax, line_total=calculated.total))
    db.add(sub)
    db.flush()
    db.add(SubscriptionHistory(subscription_id=sub.id, previous_status=None, new_status=sub.status,
        action="created", changed_by=user.id))
    log_activity(db, user_id=user.id, action="subscription_created", entity_type="subscription",
        entity_id=sub.id, description=f"Created subscription {number}")
    if discount:
        discount.usage_count = (discount.usage_count or 0) + 1
        db.flush()
        db.add(DiscountUsage(discount_id=discount.id, customer_id=customer.id, subscription_id=sub.id, discount_amount=priced.discount))
    db.commit()
    db.refresh(sub)
    return _subscription_dict(sub)


def _subscription_dict(s: Subscription):
    return {"id": str(s.id), "subscription_number": s.subscription_number, "customer_id": str(s.customer_id), "status": s.status,
        "start_date": s.start_date.isoformat() if s.start_date else None, "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None,
        "quotation_valid_until": s.quotation_valid_until.isoformat() if s.quotation_valid_until else None,
        "billing_period": s.billing_period, "billing_interval": s.billing_interval, "subtotal": str(s.subtotal or 0), "discount_total": str(s.discount_total or 0),
        "tax_total": str(s.tax_total or 0), "total": str(s.total or 0), "notes": s.notes,
        "lines": [{"id": str(l.id), "product_id": str(l.product_id), "plan_id": str(l.plan_id) if l.plan_id else None, "description": l.description,
                   "quantity": str(l.quantity or 1), "unit_price": str(l.unit_price), "discount_amount": str(l.discount_amount or 0), "tax_amount": str(l.tax_amount or 0), "line_total": str(l.line_total)} for l in s.lines]}


@router.get("")
def list_subscriptions(status_filter: str | None = Query(None, alias="status"), customer_id: UUID | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Subscription).options(joinedload(Subscription.lines))
    if user.role == "customer":
        query = query.filter(Subscription.customer_id == user.customer_id)
    elif customer_id:
        query = query.filter(Subscription.customer_id == customer_id)
    if status_filter:
        query = query.filter(Subscription.status == status_filter)
    total = query.count()
    rows = query.order_by(Subscription.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_subscription_dict(s) for s in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/{subscription_id}")
def get_subscription(subscription_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sub = db.query(Subscription).options(joinedload(Subscription.lines)).filter(Subscription.id == subscription_id).first()
    if not sub or user.role == "customer" and sub.customer_id != user.customer_id:
        raise HTTPException(404, "Subscription not found")
    data = _subscription_dict(sub)
    data["history"] = [{"previous_status": h.previous_status, "new_status": h.new_status, "action": h.action, "notes": h.notes, "created_at": h.created_at.isoformat() if h.created_at else None} for h in sub.history]
    return data


@router.post("/{subscription_id}/{action}")
def subscription_action(subscription_id: UUID, action: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sub = db.query(Subscription).options(selectinload(Subscription.lines).joinedload(SubscriptionLine.plan)).filter(Subscription.id == subscription_id).with_for_update().first()
    if not sub or user.role == "customer" and sub.customer_id != user.customer_id:
        raise HTTPException(404, "Subscription not found")
    if action not in {"confirm", "activate", "pause", "resume", "renew", "close"}:
        raise HTTPException(404, "Unknown subscription action")
    if user.role == "customer" and action not in {"pause", "resume", "close", "renew"}:
        raise HTTPException(403, "This action is not available to customers")
    target = {"confirm": "confirmed", "activate": "active", "pause": "paused", "resume": "active", "renew": "active", "close": "closed"}[action]
    if action == "renew" and any(l.plan and not l.plan.is_renewable for l in sub.lines):
        raise HTTPException(409, "The selected plan does not allow renewal")
    if action == "confirm" and sub.quotation_valid_until and sub.quotation_valid_until < date.today():
        raise HTTPException(409, "Quotation has expired")
    if action == "renew":
        if sub.status not in {"active", "closed"}:
            raise HTTPException(409, "Only active or closed renewable subscriptions can be renewed")
        previous = sub.status
        anchor = sub.next_billing_date if previous == "active" and sub.next_billing_date and sub.next_billing_date > date.today() else date.today()
        sub.status = "active"
        sub.start_date = date.today() if previous == "closed" else sub.start_date
        sub.end_date = None
        sub.next_billing_date = next_billing_date(anchor, sub.billing_period or "monthly", sub.billing_interval or 1)
        from app.models.subscription import SubscriptionHistory
        db.add(SubscriptionHistory(subscription_id=sub.id, previous_status=previous, new_status="active", action="renew", changed_by=user.id))
        log_activity(db, user_id=user.id, action="subscription_renew", entity_type="subscription", entity_id=sub.id)
        db.commit()
        return _subscription_dict(sub)
    transition_subscription(db, sub, target, user_id=user.id, action=action)
    log_activity(db, user_id=user.id, action=f"subscription_{action}", entity_type="subscription",
        entity_id=sub.id, description=f"Subscription moved to {sub.status}")
    db.commit()
    return _subscription_dict(sub)


class TemplateSubscriptionInput(BaseModel):
    customer_id: UUID
    template_id: UUID
    notes: str | None = None


class SubscriptionPatch(BaseModel):
    notes: str | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def valid_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


@router.patch("/{subscription_id}")
def update_subscription(subscription_id: UUID, payload: SubscriptionPatch, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not sub or user.role == "customer" and sub.customer_id != user.customer_id:
        raise HTTPException(404, "Subscription not found")
    if user.role == "customer" and sub.status != "draft":
        raise HTTPException(403, "Customers may update only draft subscriptions")
    if user.role not in {"customer", "admin", "staff"}:
        raise HTTPException(403, "You do not have permission to update subscriptions")
    if sub.status not in {"draft", "quotation"}:
        raise HTTPException(409, "Only draft or quotation subscriptions can be edited")
    changes = payload.model_dump(exclude_unset=True)
    start = changes.get("start_date", sub.start_date)
    end = changes.get("end_date", sub.end_date)
    if start and end and end < start:
        raise HTTPException(422, "end_date must be on or after start_date")
    for key, value in changes.items():
        setattr(sub, key, value)
    db.commit()
    return _subscription_dict(sub)


@router.post("/from-template", status_code=201)
def create_from_template(payload: TemplateSubscriptionInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.quotation import QuotationTemplate
    template = db.query(QuotationTemplate).options(joinedload(QuotationTemplate.lines)).filter(
        QuotationTemplate.id == payload.template_id, QuotationTemplate.status == "active").first()
    if not template:
        raise HTTPException(404, "Active quotation template not found")
    if not template.lines:
        raise HTTPException(422, "Quotation template contains no product lines")
    lines = [LineInput(product_id=line.product_id, plan_id=line.plan_id, quantity=line.quantity or 1) for line in template.lines]
    notes = payload.notes or template.payment_terms
    requested_status = "draft" if user.role == "customer" else "quotation"
    return create_subscription(SubscriptionInput(customer_id=payload.customer_id, lines=lines,
        notes=notes, quotation_template_id=template.id,
        quotation_valid_until=date.today() + timedelta(days=template.validity_days or 30),
        status=requested_status), db, user)
