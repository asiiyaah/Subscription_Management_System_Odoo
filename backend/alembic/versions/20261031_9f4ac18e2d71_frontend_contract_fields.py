"""Add invoice email and staff metadata used by live frontend contracts.

Revision ID: 9f4ac18e2d71
Revises: c91a4b7d2e10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9f4ac18e2d71"
down_revision: Union[str, Sequence[str], None] = "c91a4b7d2e10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("last_login", sa.DateTime(timezone=True), nullable=True))
    op.add_column("business_settings", sa.Column("gstin", sa.String(length=15), nullable=True))
    op.add_column("business_settings", sa.Column("bank_name", sa.String(length=150), nullable=True))
    op.add_column("business_settings", sa.Column("bank_account", sa.String(length=50), nullable=True))
    op.add_column("business_settings", sa.Column("bank_ifsc", sa.String(length=11), nullable=True))
    op.add_column("business_settings", sa.Column("upi_id", sa.String(length=100), nullable=True))
    op.add_column("business_settings", sa.Column("invoice_run_time", sa.Time(), server_default=sa.text("'00:00:00'"), nullable=True))
    op.add_column("business_settings", sa.Column("renewal_reminder_days", sa.Integer(), server_default=sa.text("30"), nullable=False))
    op.add_column("business_settings", sa.Column("overdue_reminder_days", sa.Integer(), server_default=sa.text("7"), nullable=False))


def downgrade() -> None:
    op.drop_column("business_settings", "overdue_reminder_days")
    op.drop_column("business_settings", "renewal_reminder_days")
    op.drop_column("business_settings", "invoice_run_time")
    op.drop_column("business_settings", "upi_id")
    op.drop_column("business_settings", "bank_ifsc")
    op.drop_column("business_settings", "bank_account")
    op.drop_column("business_settings", "bank_name")
    op.drop_column("business_settings", "gstin")
    op.drop_column("users", "last_login")
    op.drop_column("invoices", "sent_at")
