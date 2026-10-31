import uuid
from datetime import datetime
from sqlalchemy import String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database.base import Base


class Discount(Base):
    __tablename__ = "discounts"
    __table_args__ = (UniqueConstraint("code", name="uq_discounts_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(150))
    code: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)
    discount_type: Mapped[str] = mapped_column(String(20))
    value: Mapped[float] = mapped_column(Numeric(12, 2))
    minimum_quantity: Mapped[int | None] = mapped_column(
        Integer, server_default=text("0")
    )
    minimum_purchase: Mapped[float | None] = mapped_column(Numeric(12, 2), server_default=text("0"))
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    usage_count: Mapped[int | None] = mapped_column(
        Integer, server_default=text("0")
    )
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool | None] = mapped_column(
        Boolean, server_default=text("true")
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    usages = relationship("DiscountUsage", back_populates="discount")
    product_rules = relationship("DiscountProductRule", back_populates="discount", cascade="all, delete-orphan")


class DiscountProductRule(Base):
    __tablename__ = "discount_product_rules"
    __table_args__ = (UniqueConstraint("discount_id", "product_id", name="uq_discount_product_rule"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    discount_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("discounts.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))

    discount = relationship("Discount", back_populates="product_rules")
    product = relationship("Product")


class DiscountUsage(Base):
    __tablename__ = "discount_usages"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    discount_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("discounts.id", ondelete="RESTRICT")
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT")
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="RESTRICT")
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("invoices.id", ondelete="RESTRICT")
    )
    discount_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    discount = relationship("Discount", back_populates="usages")
