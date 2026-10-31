import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BadgeIndianRupee, CalendarClock, FileText, ReceiptText, Users, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, Skeleton } from "@/components/common/States";
import { Donut, foldToSlices } from "@/components/reports/InsightCharts";
import { ChartCard } from "@/components/reports/ReportCharts";
import { RecentInvoices, RecentSubscriptions, UpcomingRenewals } from "@/components/dashboard/RecentActivity";
import { RevenueChart, SubscriptionGrowthChart } from "@/components/dashboard/RevenueChart";
import { StatCard } from "@/components/dashboard/StatCard";
import { formatCurrency, formatNumber } from "@/lib/format";
import { num, USE_MOCKS } from "@/services/api";
import { dashboardService } from "@/services/dashboardService";

export default function Dashboard() {
  const navigate = useNavigate();
  const summary = useQuery({ queryKey: ["dashboard", "summary"], queryFn: () => dashboardService.summary() });
  const revenue = useQuery({ queryKey: ["dashboard", "revenue"], queryFn: () => dashboardService.revenue() });
  const growth = useQuery({ queryKey: ["dashboard", "growth"], queryFn: () => dashboardService.growth() });
  const renewals = useQuery({ queryKey: ["dashboard", "renewals"], queryFn: () => dashboardService.renewals() });
  const subscriptions = useQuery({ queryKey: ["dashboard", "recent-subscriptions"], queryFn: () => dashboardService.recentSubscriptions() });
  const invoices = useQuery({ queryKey: ["dashboard", "recent-invoices"], queryFn: () => dashboardService.recentInvoices() });

  const summaryData = summary.data;
  const statusRows = summaryData ? Object.entries(summaryData.subscription_status_breakdown).map(([label, value]) => ({ label, value: Number(value ?? 0) })) : [];
  const statuses = foldToSlices(statusRows, (row) => row.label.replace(/^./, (letter) => letter.toUpperCase()), (row) => row.value);
  return <div className="space-y-6">
    <PageHeader title="Dashboard" description={<>A current view of customers, recurring revenue, billing and renewals.{USE_MOCKS && <span className="ml-1 font-medium text-accent">Demo data · values are illustrative.</span>}</>} />

    {summary.isError && <div className="rounded-2xl border border-line bg-surface"><ErrorState message={summary.error.message} onRetry={() => void summary.refetch()} /></div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard label="Total customers" icon={<Users />} value={summaryData ? formatNumber(summaryData.total_customers) : summary.isLoading ? undefined : "—"} onClick={() => navigate("/customers")} />
      <StatCard label="Active subscriptions" icon={<FileText />} value={summaryData ? formatNumber(summaryData.active_subscriptions) : summary.isLoading ? undefined : "—"} onClick={() => navigate("/subscriptions?status=active")} />
      <StatCard label="Monthly recurring revenue" icon={<BadgeIndianRupee />} value={summaryData ? formatCurrency(num(summaryData.mrr)) : summary.isLoading ? undefined : "—"} onClick={() => navigate("/reports?tab=revenue")} />
      <StatCard label="Pending quotations" icon={<ReceiptText />} value={summaryData ? formatNumber(summaryData.subscription_status_breakdown.quotation ?? 0) : summary.isLoading ? undefined : "—"} onClick={() => navigate("/subscriptions?status=quotation")} />
      <StatCard label="Revenue collected" icon={<Wallet />} value={summaryData ? formatCurrency(num(summaryData.revenue_collected)) : summary.isLoading ? undefined : "—"} onClick={() => navigate("/reports?tab=revenue")} />
      <StatCard label="Upcoming renewals · 30 days" icon={<CalendarClock />} value={renewals.data ? formatNumber(renewals.data.length) : renewals.isLoading ? undefined : "—"} onClick={() => navigate("/subscriptions?status=active")} />
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <section>{revenue.isLoading ? <Skeleton className="h-[340px]" /> : revenue.isError ? <div className="rounded-2xl border border-line bg-surface"><ErrorState message={revenue.error.message} onRetry={() => void revenue.refetch()} /></div> : <RevenueChart data={revenue.data ?? []} mock={USE_MOCKS} />}</section>
      <section>{growth.isLoading ? <Skeleton className="h-[340px]" /> : growth.isError ? <div className="rounded-2xl border border-line bg-surface"><ErrorState message={growth.error.message} onRetry={() => void growth.refetch()} /></div> : <SubscriptionGrowthChart data={growth.data ?? null} mock={USE_MOCKS} />}</section>
    </div>

    <section>
      {summary.isLoading ? <Skeleton className="h-[260px]" /> : summary.isError ? null : <ChartCard title="Subscription status distribution" subtitle="Current status counts from the analytics summary">
        {statuses.length ? <Donut slices={statuses} format="number" centerLabel="subscriptions" /> : <p className="py-8 text-center text-sm text-muted">No subscription status data available.</p>}
      </ChartCard>}
    </section>

    <div className="grid gap-4 xl:grid-cols-3">
      <section>{subscriptions.isLoading ? <Skeleton className="h-72" /> : subscriptions.isError ? <div className="rounded-2xl border border-line bg-surface"><ErrorState message={subscriptions.error.message} onRetry={() => void subscriptions.refetch()} /></div> : <RecentSubscriptions rows={subscriptions.data ?? []} />}</section>
      <section>{invoices.isLoading ? <Skeleton className="h-72" /> : invoices.isError ? <div className="rounded-2xl border border-line bg-surface"><ErrorState message={invoices.error.message} onRetry={() => void invoices.refetch()} /></div> : <RecentInvoices rows={invoices.data ?? []} />}</section>
      <section>{renewals.isLoading ? <Skeleton className="h-72" /> : renewals.isError ? <div className="rounded-2xl border border-line bg-surface"><ErrorState message={renewals.error.message} onRetry={() => void renewals.refetch()} /></div> : <UpcomingRenewals rows={renewals.data ?? []} />}</section>
    </div>

    {summaryData && <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => navigate("/invoices")} className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 text-left hover:border-primary/50">
        <span><span className="block text-sm text-muted">Outstanding amount</span><span className="mt-1 block text-lg font-bold">{formatCurrency(num(summaryData.outstanding_amount))}</span></span><Wallet className="size-5 text-primary" aria-hidden />
      </button>
      <button type="button" onClick={() => navigate("/invoices?overdue=true")} className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 text-left hover:border-primary/50">
        <span><span className="block text-sm text-muted">Overdue invoices</span><span className="mt-1 block text-lg font-bold">{formatNumber(summaryData.overdue_invoice_count)}</span></span><AlertCircle className="size-5 text-danger" aria-hidden />
      </button>
    </div>}
  </div>;
}
