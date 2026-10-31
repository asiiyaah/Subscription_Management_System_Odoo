"""Account onboarding: forced password change, email verification, token purpose.

Revision ID: d4e1a7c3b952
Revises: 9f4ac18e2d71
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4e1a7c3b952"
down_revision: Union[str, Sequence[str], None] = "9f4ac18e2d71"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    # Existing accounts were created before verification existed — treat them as verified.
    op.execute("UPDATE users SET email_verified_at = COALESCE(created_at, now())")
    op.add_column("password_reset_tokens", sa.Column("purpose", sa.String(length=20), server_default=sa.text("'reset'"), nullable=False))


def downgrade() -> None:
    op.drop_column("password_reset_tokens", "purpose")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "must_change_password")
