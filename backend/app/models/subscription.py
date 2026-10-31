import uuid
from datetime import date, datetime
from sqlalchemy import Index, String, Text, Numeric, Integer, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy import text
from app.database.base import Base


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        Index("idx_subscriptions_billing_date", "next_billing_date"),
        Index("idx_subscriptions_customer", "customer_id"),
        Index("idx_subscriptions_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    subscription_number: Mapped[str] = mapped_column(String(50), unique=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT")
    )
    quotation_template_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("quotation_templates.id"))
    status: Mapped[str] = mapped_column(
        String(30), server_default=text("'draft'")
    )
    start_date: Mapped[date | None] = mapped_column(Date)
    next_billing_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    billing_period: Mapped[str | None] = mapped_column(String(20))
    billing_interval: Mapped[int | None] = mapped_column(
        Integer, server_default=text("1")
    )
    subtotal: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    discount_total: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    tax_total: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    total: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="subscriptions")
    quotation_template = relationship("QuotationTemplate", back_populates="subscriptions")
    creator = relationship("User", back_populates="subscriptions_created")
    lines = relationship("SubscriptionLine", back_populates="subscription")
    history = relationship("SubscriptionHistory", back_populates="subscription")
    invoices = relationship("Invoice", back_populates="subscription")


class SubscriptionLine(Base):
    __tablename__ = "subscription_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="CASCADE")
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT")
    )
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT")
    )
    product_attribute_value_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("product_attribute_values.id", ondelete="SET NULL")
    )
    description: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("1")
    )
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2))
    discount_amount: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    tax_amount: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    line_total: Mapped[float] = mapped_column(Numeric(12, 2))

    subscription = relationship("Subscription", back_populates="lines")
    product = relationship("Product", back_populates="subscription_lines")
    plan = relationship("Plan", back_populates="subscription_lines")
    attribute_value = relationship("ProductAttributeValue", back_populates="subscription_lines")


class SubscriptionHistory(Base):
    __tablename__ = "subscription_history"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="CASCADE")
    )
    previous_status: Mapped[str | None] = mapped_column(String(30))
    new_status: Mapped[str | None] = mapped_column(String(30))
    action: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subscription = relationship("Subscription", back_populates="history")