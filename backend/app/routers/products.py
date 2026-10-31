from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.product import Product, ProductAttribute, ProductAttributeValue, ProductTaxRule
from app.models.tax import Tax
from app.models.user import User

router = APIRouter(prefix="/api/products", tags=["products"])
variant_router = APIRouter(prefix="/api/product-attribute-values", tags=["products"])


class AttributeValueInput(BaseModel):
    value: str = Field(min_length=1, max_length=150)
    extra_price: Decimal = Field(default=Decimal("0"), ge=0)


class AttributeInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    values: list[AttributeValueInput] = []


class ProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    product_type: str = Field(default="service", max_length=30)
    sales_price: Decimal = Field(default=Decimal("0"), ge=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    status: str = "active"
    attributes: list[AttributeInput] | None = None


class ProductOutput(BaseModel):
    id: UUID
    name: str
    description: str | None
    product_type: str
    sales_price: Decimal
    cost_price: Decimal | None
    status: str | None
    model_config = ConfigDict(from_attributes=True)


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    product_type: str | None = Field(default=None, max_length=30)
    sales_price: Decimal | None = Field(default=None, ge=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    status: str | None = None
    attributes: list[AttributeInput] | None = None


class ProductTaxInput(BaseModel):
    tax_ids: list[UUID]


class AttributeValuePatch(BaseModel):
    value: str | None = Field(default=None, min_length=1, max_length=150)
    extra_price: Decimal | None = Field(default=None, ge=0)


class AttributePatch(BaseModel):
    name: str = Field(min_length=1, max_length=100)


def _product_dict(product: Product):
    data = ProductOutput.model_validate(product).model_dump(mode="json")
    data["attributes"] = [{"id": str(a.id), "product_id": str(product.id), "name": a.name,
        "values": [{"id": str(v.id), "attribute_id": str(a.id), "attribute_name": a.name,
            "value": v.value, "extra_price": str(v.extra_price or 0)} for v in a.values]} for a in product.attributes]
    return data


@router.get("")
def list_products(q: str | None = None, search: str | None = None, product_type: str | None = None,
                  status_filter: str | None = Query(None, alias="status"), page: int = Query(1, ge=1),
                  page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Product).options(selectinload(Product.attributes).selectinload(ProductAttribute.values))
    term = q or search
    if term:
        query = query.filter(or_(Product.name.ilike(f"%{term}%"), Product.description.ilike(f"%{term}%")))
    if product_type:
        query = query.filter(Product.product_type == product_type)
    if status_filter:
        query = query.filter(Product.status == status_filter)
    total = query.count()
    rows = query.order_by(Product.name).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_product_dict(x) for x in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/options")
def product_options(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [{"id": str(pid), "name": name} for pid, name in db.query(Product.id, Product.name)
        .filter(Product.status == "active").order_by(Product.name).all()]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    product = Product(**payload.model_dump(exclude={"attributes"}))
    for attr in payload.attributes or []:
        product.attributes.append(ProductAttribute(name=attr.name, values=[ProductAttributeValue(**v.model_dump()) for v in attr.values]))
    db.add(product)
    db.commit()
    db.refresh(product)
    return _product_dict(product)


@router.get("/{product_id}")
def get_product(product_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    product = db.query(Product).options(selectinload(Product.attributes).selectinload(ProductAttribute.values)).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(404, "Product not found")
    return _product_dict(product)


@router.patch("/{product_id}")
@router.put("/{product_id}")
def update_product(product_id: UUID, payload: ProductPatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(404, "Product not found")
    for key, value in payload.model_dump(exclude_unset=True, exclude={"attributes"}).items():
        setattr(product, key, value)
    if payload.attributes is not None:
        for attr in list(product.attributes):
            for value in list(attr.values):
                db.delete(value)
            db.delete(attr)
        db.flush()
        db.add_all([ProductAttribute(product_id=product.id, name=a.name,
            values=[ProductAttributeValue(**v.model_dump()) for v in a.values]) for a in payload.attributes])
    db.commit()
    if payload.attributes is not None:
        db.expire(product, ["attributes"])
    return _product_dict(product)


@router.delete("/{product_id}")
def archive_product(product_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(404, "Product not found")
    product.status = "archived"
    db.commit()
    return {"message": "Product archived"}


@router.post("/{product_id}/attributes", status_code=201)
def add_attribute(product_id: UUID, payload: AttributeInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(404, "Product not found")
    item = ProductAttribute(product_id=product_id, name=payload.name, values=[ProductAttributeValue(**v.model_dump()) for v in payload.values])
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": str(item.id), "product_id": str(product.id), "name": item.name, "values": [{"id": str(v.id), "attribute_id": str(item.id), "attribute_name": item.name, "value": v.value, "extra_price": str(v.extra_price or 0)} for v in item.values]}


@router.patch("/{product_id}/attributes/{attribute_id}")
def update_attribute(product_id: UUID, attribute_id: UUID, payload: AttributePatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    attr = db.query(ProductAttribute).filter(ProductAttribute.id == attribute_id, ProductAttribute.product_id == product_id).first()
    if not attr:
        raise HTTPException(404, "Product attribute not found")
    attr.name = payload.name
    db.commit()
    return {"id": str(attr.id), "name": attr.name}


@router.delete("/{product_id}/attributes/{attribute_id}")
def delete_attribute(product_id: UUID, attribute_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    attr = db.query(ProductAttribute).filter(ProductAttribute.id == attribute_id, ProductAttribute.product_id == product_id).first()
    if not attr:
        raise HTTPException(404, "Product attribute not found")
    for value in list(attr.values):
        db.delete(value)
    db.delete(attr)
    db.commit()
    return {"message": "Product attribute deleted"}


@router.post("/{product_id}/attributes/{attribute_id}/values", status_code=201)
def add_attribute_value(product_id: UUID, attribute_id: UUID, payload: AttributeValueInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    attr = db.query(ProductAttribute).filter(ProductAttribute.id == attribute_id, ProductAttribute.product_id == product_id).first()
    if not attr:
        raise HTTPException(404, "Product attribute not found")
    value = ProductAttributeValue(attribute_id=attr.id, **payload.model_dump())
    db.add(value)
    db.commit()
    db.refresh(value)
    return {"id": str(value.id), "value": value.value, "extra_price": str(value.extra_price or 0)}


@router.patch("/{product_id}/attributes/{attribute_id}/values/{value_id}")
def update_attribute_value(product_id: UUID, attribute_id: UUID, value_id: UUID, payload: AttributeValuePatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    value = db.query(ProductAttributeValue).join(ProductAttribute).filter(ProductAttributeValue.id == value_id,
        ProductAttributeValue.attribute_id == attribute_id, ProductAttribute.product_id == product_id).first()
    if not value:
        raise HTTPException(404, "Attribute value not found")
    for key, item in payload.model_dump(exclude_unset=True).items():
        setattr(value, key, item)
    db.commit()
    return {"id": str(value.id), "value": value.value, "extra_price": str(value.extra_price or 0)}


@router.delete("/{product_id}/attributes/{attribute_id}/values/{value_id}")
def delete_attribute_value(product_id: UUID, attribute_id: UUID, value_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    value = db.query(ProductAttributeValue).join(ProductAttribute).filter(ProductAttributeValue.id == value_id,
        ProductAttributeValue.attribute_id == attribute_id, ProductAttribute.product_id == product_id).first()
    if not value:
        raise HTTPException(404, "Attribute value not found")
    db.delete(value)
    db.commit()
    return {"message": "Attribute value deleted"}


@router.get("/{product_id}/taxes")
def get_product_taxes(product_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    rows = db.query(ProductTaxRule).filter(ProductTaxRule.product_id == product_id).all()
    return {"items": [{"id": str(row.tax.id), "name": row.tax.name, "tax_type": row.tax.tax_type, "rate": str(row.tax.rate)} for row in rows]}


@router.put("/{product_id}/taxes")
def set_product_taxes(product_id: UUID, payload: ProductTaxInput, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    valid = db.query(Tax.id).filter(Tax.id.in_(payload.tax_ids), Tax.is_active.is_(True)).all() if payload.tax_ids else []
    if len(valid) != len(set(payload.tax_ids)):
        raise HTTPException(422, "All tax_ids must refer to active taxes")
    db.query(ProductTaxRule).filter(ProductTaxRule.product_id == product_id).delete(synchronize_session=False)
    db.add_all([ProductTaxRule(product_id=product_id, tax_id=tax_id) for tax_id in set(payload.tax_ids)])
    db.commit()
    return get_product_taxes(product_id, db, _=None)


@variant_router.put("/{value_id}")
def update_variant(value_id: UUID, payload: AttributeValuePatch, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    value = db.query(ProductAttributeValue).options(selectinload(ProductAttributeValue.attribute)).filter(ProductAttributeValue.id == value_id).first()
    if not value:
        raise HTTPException(404, "Attribute value not found")
    for key, item in payload.model_dump(exclude_unset=True).items():
        setattr(value, key, item)
    db.commit()
    return {"id": str(value.id), "attribute_id": str(value.attribute_id), "attribute_name": value.attribute.name,
        "value": value.value, "extra_price": str(value.extra_price or 0)}


@variant_router.delete("/{value_id}")
def delete_variant(value_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "staff"))):
    value = db.get(ProductAttributeValue, value_id)
    if not value:
        raise HTTPException(404, "Attribute value not found")
    db.delete(value)
    db.commit()
    return {"message": "Attribute value deleted"}
