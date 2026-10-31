import { StatusBadge } from "@/components/common/StatusBadge";
import type { InvoiceSummaryRow } from "@/types/invoice";

type StatusFields = Pick<InvoiceSummaryRow, "status" | "is_overdue" | "amount_paid" | "balance">;

/** Overdue and part-paid aren't separate statuses in the brief — they're shown on top of "confirmed". */
export function invoiceDisplayStatus(invoice: StatusFields): string {
  if (invoice.is_overdue) return "overdue";
  if (invoice.status === "confirmed" && invoice.amount_paid > 0 && invoice.balance > 0) return "partially_paid";
  return invoice.status;
}

export function InvoiceStatusBadge({ invoice, className }: { invoice: StatusFields; className?: string }) {
  return <StatusBadge status={invoiceDisplayStatus(invoice)} className={className} />;
}
