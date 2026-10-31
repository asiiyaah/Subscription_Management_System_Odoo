import uuid
from datetime import date
from sqlalchemy import Index, String, Text, Numeric, Integer, Boolean, Date
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base
from datetime import datetime
from sqlalchemy import DateTime, text
from sqlalchemy.sql import func


class Plan(Base):
    __tablename__ = "plans"
    __table_args__ = (Index("idx_plans_product", "product_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT")
    )
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text)
    billing_period: Mapped[str] = mapped_column(String(20))
    billing_interval: Mapped[int | None] = mapped_column(
        Integer, server_default=text("1")
    )
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    trial_days: Mapped[int | None] = mapped_column(
        Integer, server_default=text("0")
    )
    minimum_quantity: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    is_pausable: Mapped[bool | None] = mapped_column(
        Boolean, server_default=text("true")
    )
    is_renewable: Mapped[bool | None] = mapped_column(
        Boolean, server_default=text("true")
    )
    auto_close: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    allows_early_closure: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(
        String(20), server_default=text("'active'")
    )
    created_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), server_default=func.now()
)
    updated_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), server_default=func.now()
)
    product = relationship("Product", back_populates="plans")
    quotation_lines = relationship("QuotationTemplateLine", back_populates="plan")
    subscription_lines = relationship("SubscriptionLine", back_populates="plan")
