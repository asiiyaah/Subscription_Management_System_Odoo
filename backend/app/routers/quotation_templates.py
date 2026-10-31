from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.plan import Plan
from app.models.product import Product
from app.models.quotation import QuotationTemplate, QuotationTemplateLine
from app.models.user import User

router = APIRouter(prefix="/api/quotation-templates", tags=["quotation templates"])


class TemplateLineInput(BaseModel):
    product_id: UUID
    plan_id: UUID | None = None
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    unit_price: Decimal = Field(ge=0)


class TemplateInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    payment_terms: str | None = None
    validity_days: int = Field(default=30, ge=1, le=365)
    status: str = "active"
    lines: list[TemplateLineInput] = []


def _dict(template):
    return {"id": str(template.id), "name": template.name, "description": template.description,
        "payment_terms": template.payment_terms, "validity_days": template.validity_days, "status": template.status,
        "lines": [{"id": str(l.id), "product_id": str(l.product_id), "plan_id": str(l.plan_id) if l.plan_id else None,
                   "quantity": str(l.quantity or 1), "unit_price": str(l.unit_price)} for l in template.lines]}


def _make_lines(db, entries):
    result = []
    for line in entries:
        product = db.get(Product, line.product_id)
        plan = db.get(Plan, line.plan_id) if line.plan_id else None
        if not product or product.status != "active" or plan and (plan.product_id != product.id or plan.status != "active"):
            raise HTTPException(422, "Template lines require an active product and a matching active plan")
        result.append(QuotationTemplateLine(product_id=product.id, plan_id=plan.id if plan else None,
            quantity=line.quantity, unit_price=line.unit_price))
    return result


@router.get("")
def list_templates(q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(QuotationTemplate).options(joinedload(QuotationTemplate.lines))
    if q:
        query = query.filter(QuotationTemplate.name.ilike(f"%{q}%"))
    total = query.count()
    items = query.order_by(QuotationTemplate.name).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_dict(x) for x in items], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_template(payload: TemplateInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    item = QuotationTemplate(name=payload.name, description=payload.description, payment_terms=payload.payment_terms,
        validity_days=payload.validity_days, status=payload.status, lines=_make_lines(db, payload.lines))
    db.add(item)
    db.commit()
    db.refresh(item)
    return _dict(item)


@router.get("/{template_id}")
def get_template(template_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.query(QuotationTemplate).options(joinedload(QuotationTemplate.lines)).filter(QuotationTemplate.id == template_id).first()
    if not item:
        raise HTTPException(404, "Quotation template not found")
    return _dict(item)


@router.put("/{template_id}")
def update_template(template_id: UUID, payload: TemplateInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    item = db.query(QuotationTemplate).options(joinedload(QuotationTemplate.lines)).filter(QuotationTemplate.id == template_id).first()
    if not item:
        raise HTTPException(404, "Quotation template not found")
    item.name, item.description, item.status = payload.name, payload.description, payload.status
    item.payment_terms, item.validity_days = payload.payment_terms, payload.validity_days
    for line in list(item.lines):
        db.delete(line)
    item.lines.extend(_make_lines(db, payload.lines))
    db.commit()
    return _dict(item)


@router.delete("/{template_id}")
def delete_template(template_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    item = db.query(QuotationTemplate).filter(QuotationTemplate.id == template_id).first()
    if not item:
        raise HTTPException(404, "Quotation template not found")
    if item.subscriptions:
        raise HTTPException(409, "A template used by subscriptions cannot be deleted")
    for line in list(item.lines):
        db.delete(line)
    db.delete(item)
    db.commit()
    return {"message": "Quotation template deleted"}
