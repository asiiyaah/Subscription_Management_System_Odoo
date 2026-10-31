import uuid
from datetime import datetime
from sqlalchemy import String, Numeric, Boolean, DateTime, Index, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.database.base import Base


class Tax(Base):
    __tablename__ = "taxes"
    __table_args__ = (Index("uq_tax_default", "is_default", unique=True, postgresql_where=text("is_default = true")),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(100))
    tax_type: Mapped[str] = mapped_column(String(20))
    rate: Mapped[float] = mapped_column(Numeric(12, 2))
    is_active: Mapped[bool | None] = mapped_column(
        Boolean, server_default=text("true")
    )
    is_default: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
