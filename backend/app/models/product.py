import uuid
from sqlalchemy import Index, String, Text, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base
from datetime import datetime
from sqlalchemy import DateTime, text
from sqlalchemy.sql import func


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (Index("idx_products_status", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    product_type: Mapped[str] = mapped_column(String(30))
    sales_price: Mapped[float] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    cost_price: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    status: Mapped[str | None] = mapped_column(
        String(20), server_default=text("'active'")
    )
    created_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), server_default=func.now()
)
    updated_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), server_default=func.now()
)
    attributes = relationship("ProductAttribute", back_populates="product")
    plans = relationship("Plan", back_populates="product")
    subscription_lines = relationship("SubscriptionLine", back_populates="product")
    invoice_lines = relationship("InvoiceLine", back_populates="product")


class ProductAttribute(Base):
    __tablename__ = "product_attributes"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(100))

    product = relationship("Product", back_populates="attributes")
    values = relationship("ProductAttributeValue", back_populates="attribute")


class ProductAttributeValue(Base):
    __tablename__ = "product_attribute_values"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    attribute_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_attributes.id", ondelete="CASCADE")
    )
    value: Mapped[str] = mapped_column(String(150))
    extra_price: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )

    attribute = relationship("ProductAttribute", back_populates="values")
    subscription_lines = relationship("SubscriptionLine", back_populates="attribute_value")