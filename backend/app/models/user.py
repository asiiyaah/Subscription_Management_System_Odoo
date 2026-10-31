import uuid
from datetime import datetime
from sqlalchemy import Index, String, Boolean, DateTime, ForeignKey, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (Index("idx_users_role", "role"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20))
    is_active: Mapped[bool | None] = mapped_column(
        Boolean, default=True, server_default=text("true")
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), unique=True, nullable=True
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set when an admin gives a temporary password; the user must choose their own before using the app.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    # When the user proved they own the email (verification link, invite link or password reset).
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="portal_user", foreign_keys=[customer_id])
    subscriptions_created = relationship("Subscription", back_populates="creator")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="user")
    activity_logs = relationship("ActivityLog", back_populates="user")
    ai_conversations = relationship("AIConversation", back_populates="user")
    
    
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    __table_args__ = (Index("idx_password_reset_user", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    # "reset" (forgot password, 30 min), "invite" (set first password, 48 h) or "verify" (confirm email, 48 h).
    purpose: Mapped[str] = mapped_column(String(20), default="reset", server_default=text("'reset'"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="password_reset_tokens")


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"
    __table_args__ = (Index("idx_revoked_tokens_expiry", "expires_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    jti: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
