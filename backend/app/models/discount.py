import uuid
from datetime import datetime
from sqlalchemy import String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database.base import Base


class Discount(Base):
    __tablename__ = "discounts"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text)
    discount_type: Mapped[str] = mapped_column(String(20))
    value: Mapped[float] = mapped_column(Numeric(12, 2))
    minimum_quantity: Mapped[int | None] = mapped_column(
        Integer, server_default=text("0")
    )
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