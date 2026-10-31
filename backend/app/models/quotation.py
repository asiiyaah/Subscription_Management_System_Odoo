import uuid
from sqlalchemy import Index, String, Text, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base
from datetime import datetime
from sqlalchemy import DateTime, text
from sqlalchemy.sql import func

class QuotationTemplate(Base):
    __tablename__ = "quotation_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(
        String(20), server_default=text("'active'")
    )
    created_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), server_default=func.now()
)
    updated_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), server_default=func.now()
)
    lines = relationship("QuotationTemplateLine", back_populates="template")
    subscriptions = relationship("Subscription", back_populates="quotation_template")


class QuotationTemplateLine(Base):
    __tablename__ = "quotation_template_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    quotation_template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quotation_templates.id", ondelete="CASCADE")
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT")
    )
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT")
    )
    quantity: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=text("1")
    )
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2))

    template = relationship("QuotationTemplate", back_populates="lines")
    product = relationship("Product")
    plan = relationship("Plan", back_populates="quotation_lines")