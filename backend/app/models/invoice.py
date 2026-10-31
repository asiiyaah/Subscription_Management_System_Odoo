import uuid
from datetime import date, datetime
from sqlalchemy import Index, String, Text, Numeric, Date, DateTime, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database.base import Base


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        Index("idx_invoices_customer", "customer_id"),
        Index("idx_invoices_due_date", "due_date"),
        Index("idx_invoices_status", "status"),
        Index(
            "uq_invoice_subscription_period",
            "subscription_id",
            "invoice_date",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT")
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="RESTRICT")
    )
    invoice_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(
        String(20), server_default=text("'draft'")
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
    amount_paid: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    balance_due: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="invoices")
    subscription = relationship("Subscription", back_populates="invoices")
    lines = relationship("InvoiceLine", back_populates="invoice")
    payments = relationship("Payment", back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE")
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL")
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

    invoice = relationship("Invoice", back_populates="lines")
    product = relationship("Product", back_populates="invoice_lines")
    taxes = relationship("InvoiceLineTax", back_populates="invoice_line")


class InvoiceLineTax(Base):
    __tablename__ = "invoice_line_taxes"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    invoice_line_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("invoice_lines.id", ondelete="CASCADE")
    )
    tax_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("taxes.id", ondelete="SET NULL")
    )
    tax_name_snapshot: Mapped[str | None] = mapped_column(String(100))
    tax_rate_snapshot: Mapped[float | None] = mapped_column(Numeric(12, 2))
    tax_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))

    invoice_line = relationship("InvoiceLine", back_populates="taxes")
    tax = relationship("Tax")