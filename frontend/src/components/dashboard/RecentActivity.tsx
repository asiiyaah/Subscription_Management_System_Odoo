import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { num } from "@/services/api";
import type { DashboardRenewal } from "@/types/dashboard";
import type { InvoiceSummaryRow } from "@/types/invoice";
import type { Subscription } from "@/types/subscription";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-line bg-surface p-5"><h2 className="mb-4 font-semibold">{title}</h2>{children}</section>;
}

export function RecentSubscriptions({ rows }: { rows: Subscription[] }) {
  return <Panel title="Recent subscriptions">{rows.length ? <ul className="divide-y divide-line">{rows.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><Link to={`/subscriptions/${row.id}`} className="font-medium text-primary hover:underline">{row.subscription_number}</Link><p className="truncate text-xs text-muted">{row.customer_name || `Customer ${row.customer_id}`}</p></div><StatusBadge status={row.status} /></li>)}</ul> : <EmptyState title="No subscriptions yet" description="New subscriptions will show here." />}</Panel>;
}

export function RecentInvoices({ rows }: { rows: InvoiceSummaryRow[] }) {
  return <Panel title="Recent invoices">{rows.length ? <ul className="divide-y divide-line">{rows.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><Link to={`/invoices/${row.id}`} className="font-medium text-primary hover:underline">{row.number}</Link><p className="truncate text-xs text-muted">{row.customer_name} · {formatDate(row.invoice_date)}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(num(row.total))}</span></li>)}</ul> : <EmptyState title="No invoices yet" description="Generated invoices will show here." />}</Panel>;
}

export function UpcomingRenewals({ rows }: { rows: DashboardRenewal[] }) {
  return <Panel title="Upcoming renewals · 30 days">{rows.length ? <ul className="divide-y divide-line">{rows.slice(0, 5).map((row) => <li key={row.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><Link to={`/subscriptions/${row.id}`} className="font-medium text-primary hover:underline">{row.subscription_number}</Link><p className="text-xs text-muted">Customer {row.customer_id}</p></div><span className="shrink-0 text-sm text-muted">{formatDate(row.end_date)}</span></li>)}</ul> : <EmptyState title="No upcoming renewals" description="No active subscriptions end in the next 30 days." />}</Panel>;
}
