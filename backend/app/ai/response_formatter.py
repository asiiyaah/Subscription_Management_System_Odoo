"""Map database-backed tools into the existing React assistant reply contract."""

from decimal import Decimal
from uuid import uuid4


def number(value) -> float:
    try:
        return float(Decimal(str(value or 0)))
    except Exception:
        return 0.0


def _table(title, rows, columns, *, link=None):
    result = {"kind": "table", "title": title, "columns": columns, "rows": rows}
    if link:
        result["link"] = link
    return result


def present(tool_name: str, result):
    if not isinstance(result, dict) or result.get("error"):
        return None
    items = result.get("items") or result.get("subscriptions") or []
    if tool_name in {"get_business_overview", "get_revenue_summary"}:
        metrics = [("mrr", "Monthly recurring revenue", "currency"),
            ("active_subscriptions", "Active subscriptions", "number"),
            ("collected_this_month", "Collected this month", "currency"),
            ("outstanding", "Outstanding", "currency"), ("overdue", "Overdue", "currency")]
        return {"kind": "metrics", "title": "Business overview", "items": [
            {"label": label, "value": number(result[key]), "format": fmt}
            for key, label, fmt in metrics if key in result]}
    if tool_name in {"get_mrr", "get_monthly_recurring_revenue"}:
        return {"kind": "metrics", "title": "Monthly recurring revenue", "items": [
            {"label": "MRR", "value": number(result.get("mrr")), "format": "currency"}]}
    if tool_name == "get_revenue":
        return {"kind": "metrics", "title": "Collected revenue", "items": [
            {"label": "Collected", "value": number(result.get("revenue")), "format": "currency"}]}
    if tool_name == "get_customer_balance":
        return {"kind": "metrics", "title": "Customer balance", "items": [
            {"label": "Outstanding", "value": number(result.get("balance_due")), "format": "currency"}]}
    if tool_name == "get_customer_details":
        return {"kind": "metrics", "title": result.get("name", "Customer details"), "items": [
            {"label": "Subscriptions", "value": int(result.get("subscriptions", 0)), "format": "number"},
            {"label": "Invoiced", "value": number(result.get("invoiced")), "format": "currency"},
            {"label": "Outstanding", "value": number(result.get("balance")), "format": "currency"}]}
    if tool_name in {"get_revenue_by_plan"}:
        return {"kind": "bar_chart", "title": "Revenue collected by plan", "format": "currency",
            "bars": [{"label": str(row.get("plan", "")), "value": number(row.get("value"))}
                for row in sorted(items, key=lambda row: number(row.get("value")), reverse=True)]}
    if tool_name in {"get_payment_statistics", "get_payment_summary"}:
        return _table("Payments by method", items, [
            {"key": "method", "label": "Method"}, {"key": "count", "label": "Payments", "format": "number"},
            {"key": "amount", "label": "Collected", "format": "currency", "align": "right"}])
    if tool_name == "get_subscription_statistics":
        return _table("Subscriptions by status", [{"status": key, "count": value}
            for key, value in result.get("counts", {}).items()], [
                {"key": "status", "label": "Status", "format": "status"},
                {"key": "count", "label": "Subscriptions", "format": "number", "align": "right"}])
    if tool_name in {"get_overdue_invoices", "get_due_invoices", "get_outstanding_payments", "get_invoices"}:
        rows = [{**row, "balance": number(row.get("balance")), "total": number(row.get("total"))}
            for row in items]
        return _table("Invoices", rows, [
            {"key": "number", "label": "Invoice"}, {"key": "customer_name", "label": "Customer"},
            {"key": "status", "label": "Status", "format": "status"},
            {"key": "due_date", "label": "Due", "format": "date"},
            {"key": "balance", "label": "Balance", "format": "currency", "align": "right"}],
            link={"base": "/invoices/", "key": "id"})
    if tool_name == "get_subscription_details":
        lines = [{**line, "id": result.get("id")} for line in result.get("lines", [])]
        return _table("Subscription details", lines, [
            {"key": "plan", "label": "Plan"}, {"key": "description", "label": "Description"},
            {"key": "quantity", "label": "Quantity", "format": "number"},
            {"key": "total", "label": "Total", "format": "currency"}],
            link={"base": "/subscriptions/", "key": "id"})
    if tool_name in {"get_expiring_subscriptions", "get_subscriptions", "get_active_subscriptions", "get_cancelled_subscriptions"}:
        return _table("Subscriptions", items, [
            {"key": "number", "label": "Subscription"}, {"key": "customer_name", "label": "Customer"},
            {"key": "plan_name", "label": "Plan"}, {"key": "status", "label": "Status", "format": "status"},
            {"key": "end_date", "label": "Ends", "format": "date"}],
            link={"base": "/subscriptions/", "key": "subscription_id"})
    if tool_name in {"create_invoice_drafts", "get_subscriptions_due_for_billing", "generate_due_invoice_preview", "preview_due_invoices"}:
        return _table("Due invoice preview", items, [
            {"key": "subscription_number", "label": "Subscription"}, {"key": "customer_name", "label": "Customer"},
            {"key": "plan_name", "label": "Plan"}, {"key": "period_start", "label": "Period start", "format": "date"},
            {"key": "status", "label": "Status", "format": "status"},
            {"key": "estimated_total", "label": "Estimated total", "format": "currency"}],
            link={"base": "/subscriptions/", "key": "subscription_id"})
    if tool_name in {"get_payments"}:
        return _table("Payments", items, [
            {"key": "number", "label": "Payment"}, {"key": "payment_date", "label": "Date", "format": "date"},
            {"key": "customer_name", "label": "Customer"}, {"key": "method", "label": "Method"},
            {"key": "amount", "label": "Amount", "format": "currency", "align": "right"}])
    if tool_name in {"get_customers", "get_top_customers"}:
        rows = [{**row, "spend": number(row.get("spend"))} for row in items]
        if tool_name == "get_customers":
            return _table("Customers", rows, [
                {"key": "name", "label": "Name"}, {"key": "email", "label": "Email"},
                {"key": "company", "label": "Company"}, {"key": "subscriptions", "label": "Subscriptions", "format": "number"},
                {"key": "active", "label": "Active", "format": "status"}])
        return _table("Customers", rows, [
            {"key": "customer_name", "label": "Customer"}, {"key": "name", "label": "Name"},
            {"key": "email", "label": "Email"}, {"key": "subscriptions", "label": "Subscriptions", "format": "number"},
            {"key": "spend", "label": "Paid", "format": "currency", "align": "right"},
            {"key": "subscription_value", "label": "Active value", "format": "currency", "align": "right"}])
    if tool_name == "get_outstanding_by_customer":
        rows = [{**row, "balance": number(row.get("balance")), "overdue": number(row.get("overdue"))} for row in items]
        return _table("Unpaid balance by customer", rows, [
            {"key": "customer_name", "label": "Customer"}, {"key": "invoices", "label": "Invoices", "format": "number"},
            {"key": "overdue", "label": "Overdue", "format": "currency"},
            {"key": "balance", "label": "Total owed", "format": "currency"}])
    if tool_name in {"preview_overdue_reminders", "prepare_overdue_reminders"}:
        rows = [{**row, "balance": number(row.get("balance"))} for row in items]
        return _table("Overdue reminder preview", rows, [
            {"key": "number", "label": "Invoice"}, {"key": "customer_name", "label": "Customer"},
            {"key": "due_date", "label": "Due", "format": "date"},
            {"key": "balance", "label": "Balance", "format": "currency"}],
            link={"base": "/invoices/", "key": "invoice_id"})
    if tool_name in {"prepare_renewal_reminders", "preview_renewal_reminders"}:
        return _table("Renewal reminder preview", result.get("prepared", []), [
            {"key": "subscription_number", "label": "Subscription"}, {"key": "customer_name", "label": "Customer"},
            {"key": "plan_name", "label": "Plan"}, {"key": "end_date", "label": "Ends", "format": "date"}],
            link={"base": "/subscriptions/", "key": "subscription_id"})
    if tool_name in {"get_revenue_by_month"}:
        return _table("Revenue by month", items, [
            {"key": "month", "label": "Month"}, {"key": "count", "label": "Payments", "format": "number"},
            {"key": "amount", "label": "Collected", "format": "currency"}])
    if tool_name == "get_subscription_growth":
        return _table("Subscription growth", items, [
            {"key": "month", "label": "Month"}, {"key": "count", "label": "New subscriptions", "format": "number"}])
    return None


def summary(tool_name: str, result) -> str:
    if not isinstance(result, dict):
        return "The requested business data is ready."
    items = result.get("items") or result.get("subscriptions") or []
    if tool_name in {"get_business_overview", "get_revenue_summary"}:
        return (f"Monthly recurring revenue is ₹{number(result.get('mrr')):,.2f} across "
            f"{int(result.get('active_subscriptions', 0) or 0)} active subscriptions. "
            f"Collected this month: ₹{number(result.get('collected_this_month')):,.2f}; "
            f"outstanding: ₹{number(result.get('outstanding')):,.2f}.")
    if tool_name in {"get_mrr", "get_monthly_recurring_revenue"}:
        return f"Monthly recurring revenue is ₹{number(result.get('mrr')):,.2f}."
    if tool_name == "get_revenue":
        return f"Collected revenue is ₹{number(result.get('revenue')):,.2f}."
    if tool_name in {"get_expiring_subscriptions", "get_overdue_invoices", "get_due_invoices", "get_invoices",
                     "get_payments", "get_customers", "get_top_customers", "get_outstanding_payments"}:
        return f"Found {len(items)} matching records."
    if tool_name == "get_active_subscriptions":
        return f"There are {int(result.get('count', len(items)))} active subscriptions."
    if tool_name == "get_subscription_statistics":
        return f"Subscription status counts are ready for {sum(result.get('counts', {}).values())} subscriptions."
    if tool_name in {"prepare_renewal_reminders", "preview_renewal_reminders"}:
        return f"{len(result.get('prepared', []))} renewal reminders are ready for review."
    if tool_name in {"prepare_overdue_reminders", "preview_overdue_reminders"}:
        return f"{len(items)} overdue reminder emails are ready for review."
    if tool_name in {"create_invoice_drafts", "get_subscriptions_due_for_billing", "generate_due_invoice_preview", "preview_due_invoices"}:
        return f"{sum(row.get('status') == 'ready' for row in items)} subscriptions are ready for invoicing."
    if tool_name == "get_revenue_by_plan":
        best = max(items, key=lambda row: number(row.get("value")), default=None)
        return f"{best['plan']} has the highest collected revenue (₹{number(best['value']):,.2f})." if best else "No plan revenue is available."
    if tool_name in {"get_payment_statistics", "get_payment_summary"}:
        return f"Collected ₹{number(result.get('collected_this_month')):,.2f} this month across {sum(int(row.get('count', 0)) for row in items)} payments."
    return "The requested business data is ready."


def tool_call_record(call_id: str, name: str, arguments: dict, status: str, result) -> dict:
    return {"id": call_id or f"tool_{uuid4().hex[:12]}", "name": name, "args": arguments,
        "status": status, "summary": summary(name, result) if status == "success" else str(result)}

