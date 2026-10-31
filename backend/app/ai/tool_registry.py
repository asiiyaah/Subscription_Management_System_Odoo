"""Typed allowlist and provider function schemas for AI business tools."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmptyArgs(ToolArgs):
    pass


class DateRangeArgs(ToolArgs):
    start_date: date | None = None
    end_date: date | None = None


class MonthsArgs(ToolArgs):
    months: int = Field(default=6, ge=1, le=60)


class ExpiringArgs(ToolArgs):
    days: int = Field(default=7, ge=1, le=365)


class CustomerArgs(ToolArgs):
    customer_id: UUID | None = None


class SubscriptionArgs(ToolArgs):
    subscription_id: UUID


class SearchArgs(ToolArgs):
    q: str | None = Field(default=None, max_length=160)
    limit: int = Field(default=25, ge=1, le=100)


class SubscriptionSearchArgs(SearchArgs):
    status: Literal["draft", "quotation", "confirmed", "active", "paused", "closed"] | None = None


class InvoiceSearchArgs(SearchArgs):
    status: Literal["draft", "open", "sent", "partial", "confirmed", "paid", "cancelled"] | None = None
    date_from: date | None = None
    date_to: date | None = None


class PaymentSearchArgs(SearchArgs):
    status: Literal["completed", "failed", "pending"] | None = None
    method: Literal["cash", "bank_transfer", "upi", "card", "cheque"] | None = None
    date_from: date | None = None
    date_to: date | None = None


class CustomerSearchArgs(SearchArgs):
    pass


class RenewalArgs(ToolArgs):
    days: int = Field(default=30, ge=1, le=365)
    limit: int = Field(default=100, ge=1, le=100)


class OverdueReminderArgs(ToolArgs):
    limit: int = Field(default=100, ge=1, le=100)


class InvoiceDraftArgs(ToolArgs):
    dry_run: bool = True


class ToolSpec:
    def __init__(self, name: str, description: str, args_model: type[ToolArgs]):
        self.name = name
        self.description = description
        self.args_model = args_model

    def provider_schema(self) -> dict:
        schema = self.args_model.model_json_schema()
        schema.pop("title", None)
        schema.pop("$defs", None)
        schema["additionalProperties"] = False
        return {"name": self.name, "description": self.description, "parameters": schema}


_specs = [
    ToolSpec("get_business_overview", "Return current MRR, active subscriptions, collections, and balances.", EmptyArgs),
    ToolSpec("get_revenue_summary", "Return current business MRR, active count, collections, and balances.", EmptyArgs),
    ToolSpec("get_monthly_recurring_revenue", "Calculate monthly recurring revenue from active subscriptions.", EmptyArgs),
    ToolSpec("get_mrr", "Calculate monthly recurring revenue from active subscriptions.", EmptyArgs),
    ToolSpec("get_revenue", "Sum collected payment revenue for an optional inclusive date range.", DateRangeArgs),
    ToolSpec("get_revenue_by_month", "Group collected payments by calendar month for an optional date range.", DateRangeArgs),
    ToolSpec("get_subscription_growth", "Count newly created subscriptions per month over the requested recent months.", MonthsArgs),
    ToolSpec("get_revenue_by_plan", "Group collected revenue by subscription plan.", EmptyArgs),
    ToolSpec("get_subscription_statistics", "Count subscriptions by each status.", EmptyArgs),
    ToolSpec("get_active_subscriptions", "List/count active subscriptions. Customer accounts see only their own.", EmptyArgs),
    ToolSpec("get_subscriptions", "Search subscriptions with an optional status and text query.", SubscriptionSearchArgs),
    ToolSpec("get_subscription_details", "Fetch one subscription by ID; customer access is ownership-scoped.", SubscriptionArgs),
    ToolSpec("get_expiring_subscriptions", "List active subscriptions ending within the requested number of days.", ExpiringArgs),
    ToolSpec("get_cancelled_subscriptions", "List recently cancelled or closed subscriptions.", SearchArgs),
    ToolSpec("get_invoices", "Search invoices by status, date range, or invoice/customer text.", InvoiceSearchArgs),
    ToolSpec("get_overdue_invoices", "List unpaid invoices whose due date has passed.", SearchArgs),
    ToolSpec("get_due_invoices", "List unpaid invoices due within the requested number of days.", ExpiringArgs),
    ToolSpec("preview_due_invoices", "Preview subscriptions due for billing without creating invoices.", EmptyArgs),
    ToolSpec("generate_due_invoice_preview", "Preview subscriptions due for billing without creating invoices.", EmptyArgs),
    ToolSpec("get_subscriptions_due_for_billing", "Preview subscriptions due for billing without creating invoices.", EmptyArgs),
    ToolSpec("create_invoice_drafts", "Prepare a due-invoice preview for administrator approval; never create invoices here.", InvoiceDraftArgs),
    ToolSpec("get_payments", "List recent payments filtered by date, method, status, or text.", PaymentSearchArgs),
    ToolSpec("get_payment_statistics", "Summarize collected payments by method and current month.", EmptyArgs),
    ToolSpec("get_payment_summary", "Summarize collected payments by method and current month.", EmptyArgs),
    ToolSpec("get_outstanding_payments", "List invoices with unpaid balances.", SearchArgs),
    ToolSpec("get_customer_balance", "Return one customer's outstanding balance; customers are restricted to themselves.", CustomerArgs),
    ToolSpec("get_outstanding_by_customer", "Group outstanding invoice totals by customer.", EmptyArgs),
    ToolSpec("get_customers", "Search customer accounts by name or email.", CustomerSearchArgs),
    ToolSpec("get_customer_details", "Fetch one customer's details and subscription/invoice totals.", CustomerArgs),
    ToolSpec("get_top_customers", "Rank customers by completed payment value.", SearchArgs),
    ToolSpec("preview_renewal_reminders", "Preview which subscriptions match the renewal reminder window.", RenewalArgs),
    ToolSpec("prepare_renewal_reminders", "Prepare a reminder preview requiring administrator approval before sending.", RenewalArgs),
    ToolSpec("preview_overdue_reminders", "Preview customers with overdue invoices before any email is sent.", OverdueReminderArgs),
    ToolSpec("prepare_overdue_reminders", "Prepare overdue invoice reminder emails requiring administrator approval.", OverdueReminderArgs),
]

TOOL_REGISTRY = {spec.name: spec for spec in _specs}
TOOL_NAMES = frozenset(TOOL_REGISTRY)
TOOL_SCHEMAS = [spec.provider_schema() for spec in _specs]
CUSTOMER_TOOL_NAMES = frozenset({
    "get_revenue", "get_active_subscriptions", "get_subscriptions", "get_expiring_subscriptions",
    "get_subscription_details", "get_cancelled_subscriptions", "get_invoices", "get_overdue_invoices",
    "get_due_invoices", "get_payments", "get_outstanding_payments", "get_customer_balance", "get_customer_details",
})


def tool_names_for_role(role: str) -> frozenset[str]:
    return CUSTOMER_TOOL_NAMES if role == "customer" else TOOL_NAMES


def tool_schemas_for_role(role: str) -> list[dict]:
    allowed = tool_names_for_role(role)
    return [schema for schema in TOOL_SCHEMAS if schema["name"] in allowed]


def validate_tool_arguments(name: str, arguments: dict | None) -> dict:
    spec = TOOL_REGISTRY.get(name)
    if spec is None:
        raise ValueError("Unsupported assistant tool")
    validated = spec.args_model.model_validate(arguments or {})
    return validated.model_dump(exclude_unset=True, mode="python")
