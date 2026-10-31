import type { Column } from "@/components/common/DataTable";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { formatCurrency, formatDate, formatRelativeDays } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { InvoiceSummaryRow } from "@/types/invoice";

/** Columns shared by the Invoices page and the embedded <InvoiceTable>. */
export function invoiceColumns({
  showCustomer = true,
  showSubscription = true,
}: { showCustomer?: boolean; showSubscription?: boolean } = {}): Column<InvoiceSummaryRow>[] {
  return [
    {
      key: "number",
      header: "Invoice",
      sortable: true,
      render: (row) => <span className="font-semibold">{row.number}</span>,
    },
    ...(showCustomer
      ? [{ key: "customer_name", header: "Customer", sortable: true } satisfies Column<InvoiceSummaryRow>]
      : []),
    ...(showSubscription
      ? [
          {
            key: "subscription_number",
            header: "Subscription",
            render: (row) => <span className="text-muted">{row.subscription_number}</span>,
          } satisfies Column<InvoiceSummaryRow>,
        ]
      : []),
    {
      key: "invoice_date",
      header: "Invoice date",
      sortable: true,
      render: (row) => formatDate(row.invoice_date),
    },
    {
      key: "due_date",
      header: "Due date",
      sortable: true,
      render: (row) => {
        const open = row.status === "confirmed" && row.balance > 0;
        return (
          <div>
            <div className={cn(row.is_overdue && "font-semibold text-danger")}>{formatDate(row.due_date)}</div>
            {open && (
              <div className={cn("text-xs", row.is_overdue ? "text-danger/80" : "text-muted")}>
                {row.is_overdue ? `Overdue · ${formatRelativeDays(row.due_date)}` : formatRelativeDays(row.due_date)}
              </div>
            )}
          </div>
        );
      },
    },
    { key: "total", header: "Total", sortable: true, align: "right", render: (row) => formatCurrency(row.total) },
    {
      key: "balance",
      header: "Balance",
      sortable: true,
      align: "right",
      render: (row) =>
        row.status === "cancelled" ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={cn("font-semibold", row.balance > 0 ? "text-ink" : "text-success")}>
            {formatCurrency(row.balance)}
          </span>
        ),
    },
    { key: "status", header: "Status", render: (row) => <InvoiceStatusBadge invoice={row} /> },
  ];
}
