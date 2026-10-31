"""Add missing fields and rule associations required by backend workflows.

Revision ID: c91a4b7d2e10
Revises: 3b301030d054
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c91a4b7d2e10"
down_revision: Union[str, Sequence[str], None] = "3b301030d054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("minimum_quantity", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.add_column("subscriptions", sa.Column("quotation_valid_until", sa.Date(), nullable=True))
    op.add_column("plans", sa.Column("auto_close", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("plans", sa.Column("allows_early_closure", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("taxes", sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.create_index("uq_tax_default", "taxes", ["is_default"], unique=True, postgresql_where=sa.text("is_default = true"))
    op.add_column("discounts", sa.Column("code", sa.String(length=50), nullable=True))
    op.create_unique_constraint("uq_discounts_code", "discounts", ["code"])
    op.add_column("discounts", sa.Column("minimum_purchase", sa.Numeric(12, 2), server_default=sa.text("0"), nullable=True))
    op.add_column("quotation_templates", sa.Column("payment_terms", sa.Text(), nullable=True))
    op.add_column("quotation_templates", sa.Column("validity_days", sa.Integer(), server_default=sa.text("30"), nullable=False))
    op.add_column("business_settings", sa.Column("auto_generate_invoices", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("business_settings", sa.Column("send_renewal_reminders", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("business_settings", sa.Column("auto_close_expired", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.create_table(
        "product_tax_rules",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("tax_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tax_id"], ["taxes.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "tax_id", name="uq_product_tax_rule"),
    )
    op.create_table(
        "discount_product_rules",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("discount_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["discount_id"], ["discounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("discount_id", "product_id", name="uq_discount_product_rule"),
    )
    op.create_table(
        "revoked_tokens",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("jti"),
    )
    op.create_index("idx_revoked_tokens_expiry", "revoked_tokens", ["expires_at"])
    op.create_table(
        "renewal_reminder_logs",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("subscription_id", sa.Uuid(), nullable=False),
        sa.Column("subscription_end_date", sa.Date(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("uq_renewal_reminder_subscription_end", "renewal_reminder_logs", ["subscription_id", "subscription_end_date"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_renewal_reminder_subscription_end", table_name="renewal_reminder_logs")
    op.drop_table("renewal_reminder_logs")
    op.drop_index("idx_revoked_tokens_expiry", table_name="revoked_tokens")
    op.drop_table("revoked_tokens")
    op.drop_table("discount_product_rules")
    op.drop_table("product_tax_rules")
    op.drop_index("uq_tax_default", table_name="taxes")
    op.drop_column("business_settings", "auto_close_expired")
    op.drop_column("business_settings", "send_renewal_reminders")
    op.drop_column("business_settings", "auto_generate_invoices")
    op.drop_column("quotation_templates", "validity_days")
    op.drop_column("quotation_templates", "payment_terms")
    op.drop_column("discounts", "minimum_purchase")
    op.drop_constraint("uq_discounts_code", "discounts", type_="unique")
    op.drop_column("discounts", "code")
    op.drop_column("taxes", "is_default")
    op.drop_column("plans", "allows_early_closure")
    op.drop_column("plans", "auto_close")
    op.drop_column("plans", "minimum_quantity")
    op.drop_column("subscriptions", "quotation_valid_until")
