import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, FileText, Hourglass, Repeat, RotateCcw, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, Skeleton } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SummaryCard } from "@/components/common/SummaryCard";
import { Tabs } from "@/components/common/Tabs";
import { PaymentMethodBadge } from "@/components/payments/PaymentMethodBadge";
import { ChartCard, Legend, MonthlyBars, RankedBars } from "@/components/reports/ReportCharts";
import { downloadCsv, ReportTable, type ReportColumn } from "@/components/reports/ReportTable";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { CHART, formatMonth } from "@/lib/chartTheme";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { reportService } from "@/services/reportService";
import { PAYMENT_METHOD_LABELS } from "@/types/invoice";
import type { ReportData, ReportFilters } from "@/types/report";

// --- Period presets ---------------------------------------------------------------

const PERIODS = [
  { value: "this_month", label: "This month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
];
const DEFAULT_PERIOD = "last_3_months";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetRange(period: string): { from: string; to: string } {
  const now = new Date();
  const to = isoDate(now);
  const monthsBack = { this_month: 0, last_3_months: 2, last_6_months: 5 }[period as "this_month"];
  if (period === "this_year") return { from: `${now.getFullYear()}-01-01`, to };
  return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - (monthsBack ?? 2), 1)), to };
}

// --- Tables (columns double as CSV export definitions) -------------------------------

type Row<K extends keyof ReportData> = ReportData[K] extends Array<infer R> ? R : never;

const REVENUE_COLUMNS: ReportColumn<Row<"revenue_by_month">>[] = [
  { key: "month", label: "Month", render: (r) => formatMonth(r.month), csv: (r) => r.month },
  { key: "invoiced", label: "Invoiced", align: "right", render: (r) => formatCurrency(r.invoiced), csv: (r) => r.invoiced },
  { key: "collected", label: "Collected", align: "right", render: (r) => formatCurrency(r.collected), csv: (r) => r.collected },
  {
    key: "rate",
    label: "Collected vs invoiced",
    align: "right",
    render: (r) => (r.invoiced ? `${Math.round((r.collected / r.invoiced) * 100)}%` : "—"),
    csv: (r) => (r.invoiced ? Math.round((r.collected / r.invoiced) * 100) : ""),
  },
];

const SUBSCRIPTION_COLUMNS: ReportColumn<Row<"subscriptions">>[] = [
  {
    key: "number",
    label: "Subscription",
    render: (r) => (
      <Link to={`/subscriptions/${r.id}`} className="font-semibold text-primary hover:underline">
        {r.number}
      </Link>
    ),
    csv: (r) => r.number,
  },
  { key: "customer", label: "Customer", render: (r) => r.customer_name, csv: (r) => r.customer_name },
  { key: "plan", label: "Plan", render: (r) => r.plan_name, csv: (r) => r.plan_name },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, csv: (r) => r.status },
  { key: "start", label: "Started", render: (r) => formatDate(r.start_date), csv: (r) => r.start_date },
  { key: "mrr", label: "Monthly value", align: "right", render: (r) => formatCurrency(r.mrr), csv: (r) => r.mrr },
];

const PAYMENT_COLUMNS: ReportColumn<Row<"payments">>[] = [
  { key: "number", label: "Payment", render: (r) => <span className="font-semibold">{r.number}</span>, csv: (r) => r.number },
  { key: "date", label: "Date", render: (r) => formatDate(r.payment_date), csv: (r) => r.payment_date },
  { key: "customer", label: "Customer", render: (r) => r.customer_name, csv: (r) => r.customer_name },
  {
    key: "invoice",
    label: "Invoice",
    render: (r) => (
      <Link to={`/invoices/${r.invoice_id}`} className="text-primary hover:underline">
        {r.invoice_number}
      </Link>
    ),
    csv: (r) => r.invoice_number,
  },
  { key: "method", label: "Method", render: (r) => <PaymentMethodBadge method={r.method} />, csv: (r) => PAYMENT_METHOD_LABELS[r.method] },
  { key: "amount", label: "Amount", align: "right", render: (r) => formatCurrency(r.amount), csv: (r) => r.amount },
];

const OVERDUE_COLUMNS: ReportColumn<Row<"overdue">>[] = [
  {
    key: "number",
    label: "Invoice",
    render: (r) => (
      <Link to={`/invoices/${r.id}`} className="font-semibold text-primary hover:underline">
        {r.number}
      </Link>
    ),
    csv: (r) => r.number,
  },
  { key: "customer", label: "Customer", render: (r) => r.customer_name, csv: (r) => r.customer_name },
  { key: "plan", label: "Plan", render: (r) => r.plan_name, csv: (r) => r.plan_name },
  { key: "due", label: "Due date", render: (r) => formatDate(r.due_date), csv: (r) => r.due_date },
  {
    key: "days",
    label: "Days overdue",
    align: "right",
    render: (r) => <span className={cn(r.days_overdue > 30 && "font-semibold text-danger")}>{r.days_overdue}</span>,
    csv: (r) => r.days_overdue,
  },
  { key: "balance", label: "Balance", align: "right", render: (r) => formatCurrency(r.balance), csv: (r) => r.balance },
];

const TABS = [
  { value: "revenue", label: "Revenue" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "payments", label: "Payments" },
  { value: "overdue", label: "Overdue" },
] as const;
type Tab = (typeof TABS)[number]["value"];

// --- Page ----------------------------------------------------------------------------

/** Finance lead's one-place view (R37) with filters and a summary (R38). Filters live in the URL. */
export default function Reports() {
  const [params, setParams] = useSearchParams();
  const period = params.get("period") ?? DEFAULT_PERIOD;
  const tab = (TABS.some((t) => t.value === params.get("tab")) ? params.get("tab") : "revenue") as Tab;

  const filters = useMemo<ReportFilters>(() => {
    const range = period === "custom" ? { from: params.get("from") ?? "", to: params.get("to") ?? "" } : presetRange(period);
    return {
      date_from: range.from || presetRange(DEFAULT_PERIOD).from,
      date_to: range.to || isoDate(new Date()),
      plan: params.get("plan") ?? undefined,
      customer_id: params.get("customer") ? Number(params.get("customer")) : undefined,
    };
  }, [params, period]);
  const rangeInvalid = filters.date_from > filters.date_to;

  const report = useQuery({
    queryKey: ["reports", filters],
    queryFn: () => reportService.get(filters),
    placeholderData: keepPreviousData,
    enabled: !rangeInvalid,
  });
  const options = useQuery({ queryKey: ["reports", "options"], queryFn: () => reportService.options(), staleTime: 5 * 60_000 });

  function update(changes: Record<string, string | undefined>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  function changePeriod(value: string) {
    if (value === "custom") {
      // Start the custom range from whatever was showing.
      update({ period: value, from: filters.date_from, to: filters.date_to });
    } else {
      update({ period: value === DEFAULT_PERIOD ? undefined : value, from: undefined, to: undefined });
    }
  }

  const isFiltered = params.has("period") || params.has("plan") || params.has("customer");
  const data = report.data;
  const rangeLabel = `${formatDate(filters.date_from)} – ${formatDate(filters.date_to)}`;

  function exportCsv() {
    if (!data) return;
    const stamp = `${filters.date_from}_${filters.date_to}`;
    if (tab === "revenue") downloadCsv(`revenue_${stamp}.csv`, REVENUE_COLUMNS, data.revenue_by_month);
    if (tab === "subscriptions") downloadCsv(`subscriptions_${stamp}.csv`, SUBSCRIPTION_COLUMNS, data.subscriptions);
    if (tab === "payments") downloadCsv(`payments_${stamp}.csv`, PAYMENT_COLUMNS, data.payments);
    if (tab === "overdue") downloadCsv(`overdue_${stamp}.csv`, OVERDUE_COLUMNS, data.overdue);
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Subscriptions, revenue, payments and overdue invoices in one place."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!data || rangeInvalid}>
            <Download aria-hidden /> Export {TABS.find((t) => t.value === tab)!.label} CSV
          </Button>
        }
      />

      {/* Filters — one row above everything they affect */}
      <section aria-label="Report filters" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface/70 p-4">
        <Select
          label="Period"
          className="w-44"
          options={PERIODS}
          value={period}
          onChange={(event) => changePeriod(event.target.value)}
        />
        {period === "custom" && (
          <>
            <DateInput label="From" value={params.get("from") ?? ""} onChange={(v) => update({ from: v })} />
            <DateInput label="To" value={params.get("to") ?? ""} onChange={(v) => update({ to: v })} />
          </>
        )}
        <Select
          label="Plan"
          className="w-48"
          placeholder="All plans"
          options={(options.data?.plans ?? []).map((plan) => ({ value: plan, label: plan }))}
          value={params.get("plan") ?? ""}
          onChange={(event) => update({ plan: event.target.value || undefined })}
        />
        <Select
          label="Customer"
          className="w-52"
          placeholder="All customers"
          options={(options.data?.customers ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
          value={params.get("customer") ?? ""}
          onChange={(event) => update({ customer: event.target.value || undefined })}
        />
        {isFiltered && (
          <Button variant="ghost" onClick={() => setParams(tab === "revenue" ? {} : { tab }, { replace: true })}>
            <RotateCcw aria-hidden /> Reset
          </Button>
        )}
        <p className="ml-auto self-center text-xs text-muted">{rangeInvalid ? "" : rangeLabel}</p>
      </section>

      {rangeInvalid ? (
        <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          The "From" date is after the "To" date. Pick a valid range to see the report.
        </p>
      ) : report.isError ? (
        <div className="rounded-2xl border border-line bg-surface/70">
          <ErrorState message={report.error.message} onRetry={() => report.refetch()} />
        </div>
      ) : (
        <div className={cn("space-y-6 transition-opacity", report.isFetching && data && "opacity-60")}>
          {/* Summary view (R38) */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <SummaryCard icon={<Repeat />} label="Active subscriptions" value={data && formatNumber(data.summary.active_subscriptions)} tone="violet" />
            <SummaryCard icon={<TrendingUp />} label="MRR (today)" value={data && formatCurrency(data.summary.mrr)} tone="primary" />
            <SummaryCard icon={<FileText />} label="Invoiced in period" value={data && formatCurrency(data.summary.invoiced)} tone="info" />
            <SummaryCard icon={<Wallet />} label="Collected in period" value={data && formatCurrency(data.summary.collected)} tone="success" />
            <SummaryCard icon={<Hourglass />} label="Outstanding (today)" value={data && formatCurrency(data.summary.outstanding)} tone="accent" />
            <SummaryCard
              icon={<AlertTriangle />}
              label={`Overdue${data ? ` · ${data.summary.overdue_count}` : ""}`}
              value={data && formatCurrency(data.summary.overdue_amount)}
              tone="danger"
              onClick={() => update({ tab: "overdue" })}
            />
          </div>

          <Tabs aria-label="Report section" tabs={[...TABS]} value={tab} onChange={(value) => update({ tab: value === "revenue" ? undefined : value })} />

          {!data ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Skeleton className="h-80 rounded-2xl" />
              <Skeleton className="h-80 rounded-2xl" />
            </div>
          ) : (
            <>
              {tab === "revenue" && <RevenueTab data={data} />}
              {tab === "subscriptions" && <SubscriptionsTab data={data} />}
              {tab === "payments" && <PaymentsTab data={data} />}
              {tab === "overdue" && <OverdueTab data={data} />}
            </>
          )}
        </div>
      )}
    </>
  );
}

// --- Tabs ----------------------------------------------------------------------------

function RevenueTab({ data }: { data: ReportData }) {
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard
          title="Invoiced vs collected"
          subtitle="By month, including taxes"
          legend={
            <Legend
              items={[
                { label: "Invoiced", color: CHART.series1 },
                { label: "Collected", color: CHART.series2 },
              ]}
            />
          }
        >
          <MonthlyBars
            data={data.revenue_by_month}
            series={[
              { key: "invoiced", label: "Invoiced", color: CHART.series1 },
              { key: "collected", label: "Collected", color: CHART.series2 },
            ]}
          />
        </ChartCard>
        <ChartCard title="Invoiced by plan" subtitle="In the selected period">
          <RankedBars
            rows={data.revenue_by_plan.map((r) => ({
              key: r.plan,
              label: r.plan,
              value: r.invoiced,
              hint: `${formatCurrency(r.collected)} collected`,
            }))}
          />
        </ChartCard>
      </div>
      <ReportTable title="Monthly breakdown" columns={REVENUE_COLUMNS} rows={data.revenue_by_month} rowKey={(r) => r.month} />
    </>
  );
}

function SubscriptionsTab({ data }: { data: ReportData }) {
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Subscriptions by status" subtitle="Today · Draft → Quotation → Confirmed → Active → Closed">
          <RankedBars
            format="number"
            rows={data.subscriptions_by_status.map((r) => ({ key: r.status, label: <StatusBadge status={r.status} />, value: r.count }))}
          />
        </ChartCard>
        <ChartCard title="MRR by plan" subtitle="Active subscriptions only">
          <RankedBars
            rows={data.subscriptions_by_plan.map((r) => ({
              key: r.plan,
              label: r.plan,
              value: r.mrr,
              hint: `${r.count} active subscription${r.count === 1 ? "" : "s"}`,
            }))}
            empty="No active subscriptions for these filters."
          />
        </ChartCard>
      </div>
      <ReportTable
        title="Subscriptions"
        subtitle="Filtered by plan and customer (not by date)"
        columns={SUBSCRIPTION_COLUMNS}
        rows={data.subscriptions}
        rowKey={(r) => r.id}
      />
    </>
  );
}

function PaymentsTab({ data }: { data: ReportData }) {
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard title="Payments received" subtitle="By month">
          <MonthlyBars data={data.payments_by_month} series={[{ key: "amount", label: "Received", color: CHART.series1 }]} />
        </ChartCard>
        <ChartCard title="By method" subtitle="In the selected period">
          <RankedBars
            rows={data.payments_by_method.map((r) => ({
              key: r.method,
              label: PAYMENT_METHOD_LABELS[r.method],
              value: r.amount,
              hint: `${r.count} payment${r.count === 1 ? "" : "s"}`,
            }))}
            empty="No payments in this period."
          />
        </ChartCard>
      </div>
      <ReportTable
        title="Payments"
        subtitle={
          data.payments_total > data.payments.length
            ? `Latest ${data.payments.length} of ${data.payments_total} — see Payments for the full list`
            : `${data.payments_total} in the selected period`
        }
        columns={PAYMENT_COLUMNS}
        rows={data.payments}
        rowKey={(r) => r.id}
        empty="No payments in this period."
      />
    </>
  );
}

function OverdueTab({ data }: { data: ReportData }) {
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ChartCard title="Overdue by age" subtitle="Unpaid balance, today">
          <RankedBars
            rows={data.overdue_aging.map((r) => ({
              key: r.bucket,
              label: r.bucket,
              value: r.amount,
              hint: `${r.count} invoice${r.count === 1 ? "" : "s"}`,
            }))}
            empty="Nothing is overdue."
          />
        </ChartCard>
        <ReportTable
          title="Overdue invoices"
          subtitle="Oldest first — chase these before they turn into lost revenue"
          columns={OVERDUE_COLUMNS}
          rows={data.overdue}
          rowKey={(r) => r.id}
          empty="Nothing is overdue. 🎉"
        />
      </div>
    </>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string | undefined) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="h-11 rounded-xl border border-line bg-surface-2/60 px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20"
      />
    </label>
  );
}
