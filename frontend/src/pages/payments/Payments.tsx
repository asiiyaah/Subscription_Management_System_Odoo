import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarCheck, Eye, Hourglass, Plus, Receipt, TrendingUp, Wallet } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { Skeleton } from "@/components/common/States";
import { SummaryCard } from "@/components/common/SummaryCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PAYMENT_METHOD_ICONS, PaymentMethodBadge } from "@/components/payments/PaymentMethodBadge";
import { RecordPaymentDialog } from "@/components/payments/RecordPaymentDialog";
import { useListQuery } from "@/hooks/useListQuery";
import { formatCurrency, formatDate } from "@/lib/format";
import { paymentService } from "@/services/paymentService";
import { PAYMENT_METHOD_LABELS } from "@/types/invoice";
import type { PaymentListQuery, PaymentRow, PaymentStats } from "@/types/payment";

const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }));

const COLUMNS: Column<PaymentRow>[] = [
  { key: "number", header: "Payment", sortable: true, render: (row) => <span className="font-semibold">{row.number}</span> },
  { key: "payment_date", header: "Date", sortable: true, render: (row) => formatDate(row.payment_date) },
  { key: "customer_name", header: "Customer", sortable: true },
  {
    key: "invoice_number",
    header: "Invoice",
    render: (row) => (
      <Link
        to={`/invoices/${row.invoice_id}`}
        onClick={(event) => event.stopPropagation()}
        className="font-medium text-primary hover:underline"
      >
        {row.invoice_number}
      </Link>
    ),
  },
  { key: "method", header: "Method", render: (row) => <PaymentMethodBadge method={row.method} /> },
  {
    key: "note",
    header: "Note",
    render: (row) =>
      row.note ? (
        <span className="block max-w-56 truncate text-muted" title={row.note}>
          {row.note}
        </span>
      ) : (
        <span className="text-muted/50">—</span>
      ),
  },
  {
    key: "amount",
    header: "Amount",
    sortable: true,
    align: "right",
    render: (row) => <span className="font-semibold text-success">{formatCurrency(row.amount)}</span>,
  },
];

export default function Payments() {
  const navigate = useNavigate();
  const [recordOpen, setRecordOpen] = useState(false);
  const list = useListQuery({ sortBy: "payment_date", sortDir: "desc" });
  const query = list.query as PaymentListQuery;

  const payments = useQuery({
    queryKey: ["payments", "list", query],
    queryFn: () => paymentService.list(query),
    placeholderData: keepPreviousData,
  });

  const stats = useQuery({
    queryKey: ["payments", "stats"],
    queryFn: () => paymentService.stats(),
  });

  const dateError = query.date_from && query.date_to && query.date_from > query.date_to;

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every payment received, matched to its invoice."
        actions={
          <Button onClick={() => setRecordOpen(true)}>
            <Plus aria-hidden /> Record payment
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={<Wallet />}
          label="Collected this month"
          value={stats.data && formatCurrency(stats.data.collected_this_month)}
          tone="success"
        />
        <SummaryCard
          icon={<Receipt />}
          label="Payments this month"
          value={stats.data && String(stats.data.payments_this_month)}
          tone="violet"
        />
        <SummaryCard
          icon={<TrendingUp />}
          label="Top method"
          value={stats.data && (stats.data.top_method ? PAYMENT_METHOD_LABELS[stats.data.top_method] : "—")}
          tone="info"
        />
        <SummaryCard
          icon={<Hourglass />}
          label="Still outstanding"
          value={stats.data && formatCurrency(stats.data.outstanding)}
          tone="accent"
          onClick={() => navigate("/invoices?status=confirmed")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          <DataTable
            columns={COLUMNS}
            data={payments.data}
            isLoading={payments.isPending}
            isFetching={payments.isFetching}
            isError={payments.isError}
            errorMessage={payments.error?.message}
            onRetry={() => payments.refetch()}
            list={list}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/invoices/${row.invoice_id}`)}
            rowActions={(row) => [
              { label: "View invoice", icon: <Eye />, onSelect: () => navigate(`/invoices/${row.invoice_id}`) },
            ]}
            searchPlaceholder="Search payment, customer, invoice or note…"
            filters={
              <>
                <Select
                  aria-label="Payment method"
                  placeholder="All methods"
                  options={METHOD_OPTIONS}
                  value={query.method ?? ""}
                  onChange={(event) => list.setFilter("method", event.target.value || undefined)}
                />
                <DateFilter label="From" value={query.date_from} onChange={(v) => list.setFilter("date_from", v)} />
                <DateFilter label="To" value={query.date_to} onChange={(v) => list.setFilter("date_to", v)} />
                <Button variant="ghost" size="sm" onClick={() => thisMonth(list.setFilters)}>
                  <CalendarCheck aria-hidden /> This month
                </Button>
              </>
            }
            empty={{
              icon: <Wallet />,
              title: "No payments yet",
              description: "Payments you record against invoices appear here.",
              action: (
                <Button size="sm" onClick={() => setRecordOpen(true)}>
                  <Plus aria-hidden /> Record payment
                </Button>
              ),
            }}
          />
          {dateError && <p className="text-sm text-danger">"From" date is after the "To" date, so nothing can match.</p>}
        </div>

        <MethodBreakdown stats={stats.data} />
      </div>

      <RecordPaymentDialog open={recordOpen} invoice={null} onClose={() => setRecordOpen(false)} />
    </>
  );
}

function thisMonth(setFilters: (changes: Record<string, string | undefined>) => void) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  setFilters({ date_from: first, date_to: today });
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      {label}
      <input
        type="date"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="h-10 rounded-xl border border-line bg-surface-2/60 px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20"
      />
    </label>
  );
}

/** "Collected this month by method" — bar per payment method. */
function MethodBreakdown({ stats }: { stats: PaymentStats | undefined }) {
  const max = Math.max(1, ...(stats?.by_method.map((m) => m.amount) ?? [1]));
  return (
    <section className="h-fit rounded-2xl border border-line bg-surface/70 p-5">
      <h2 className="font-semibold">By method</h2>
      <p className="text-xs text-muted">Collected this month</p>

      {!stats ? (
        <div className="mt-4 space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : stats.by_method.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No payments this month yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {stats.by_method.map(({ method, amount, count }) => {
            const Icon = PAYMENT_METHOD_ICONS[method];
            return (
              <li key={method}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-muted" aria-hidden />
                    {PAYMENT_METHOD_LABELS[method]}
                    <span className="text-xs text-muted">· {count}</span>
                  </span>
                  <span className="font-semibold">{formatCurrency(amount)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                    style={{ width: `${(amount / max) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
