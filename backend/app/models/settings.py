import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, DateTime, Boolean, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.database.base import Base


class BusinessSetting(Base):
    __tablename__ = "business_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    business_name: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(
        String(10), server_default=text("'INR'")
    )
    timezone: Mapped[str | None] = mapped_column(
        String(100), server_default=text("'Asia/Kolkata'")
    )
    invoice_prefix: Mapped[str | None] = mapped_column(
        String(20), server_default=text("'INV'")
    )
    subscription_prefix: Mapped[str | None] = mapped_column(
        String(20), server_default=text("'SUB'")
    )
    default_payment_terms: Mapped[int | None] = mapped_column(
        Integer, server_default=text("15")
    )
    auto_generate_invoices: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    send_renewal_reminders: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    auto_close_expired: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
