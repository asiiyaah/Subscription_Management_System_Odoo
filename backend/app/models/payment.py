import uuid
from datetime import datetime
from sqlalchemy import Index, String, Text, Numeric, DateTime, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database.base import Base


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (Index("idx_payments_invoice", "invoice_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("invoices.id", ondelete="RESTRICT")
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT")
    )
    payment_reference: Mapped[str | None] = mapped_column(String(100), unique=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    payment_method: Mapped[str | None] = mapped_column(String(30))
    payment_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(
        String(20), server_default=text("'completed'")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    invoice = relationship("Invoice", back_populates="payments")
    customer = relationship("Customer", back_populates="payments")