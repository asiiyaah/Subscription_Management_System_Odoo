import { useQuery } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Repeat, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useListQuery } from "@/hooks/useListQuery";
import { formatCurrency, formatDate } from "@/lib/format";
import { num } from "@/services/api";
import { portalService } from "@/services/portalService";
import type { ApiError } from "@/services/api";
import type { PortalSubscription, PortalSubscriptionListQuery } from "@/types/portal";

const STATUSES = ["draft", "quotation", "confirmed", "active", "paused", "closed"];

export default function MySubscriptions() {
  const list = useListQuery({ pageSize: 10 });
  const pageQuery: PortalSubscriptionListQuery = { page: list.query.page, page_size: list.query.page_size };
  const query = useQuery({
    queryKey: ["portal", "subscriptions", pageQuery.page, pageQuery.page_size],
    queryFn: () => portalService.subscriptions(pageQuery),
    placeholderData: keepPreviousData,
  });
  const statusFilter = String(list.query.status ?? "");
  const term = String(list.query.search ?? "").trim().toLowerCase();
  const visible = (query.data?.items ?? []).filter((subscription) => {
    const statusMatches = !statusFilter || subscription.status === statusFilter;
    const searchMatches = !term || `${subscription.subscription_number} ${subscription.plan_name}`.toLowerCase().includes(term);
    return statusMatches && searchMatches;
  });
  const pageCount = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.page_size)) : 1;

  return <div className="space-y-5">
    <PageHeader title="My subscriptions" description="Your plans, billing schedule and subscription status." />
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/70 p-4 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search subscriptions on this page</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={list.searchInput} onChange={(event) => list.setSearchInput(event.target.value)} placeholder="Search number or plan on this page" className="h-10 w-full rounded-xl border border-line bg-surface-2/60 pl-10 pr-3 text-sm placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20" />
        </label>
        <Select aria-label="Filter subscriptions on this page by status" className="sm:w-52" value={statusFilter} onChange={(event) => list.setFilter("status", event.target.value || undefined)} placeholder="All statuses" options={STATUSES.map((status) => ({ value: status, label: status[0].toUpperCase() + status.slice(1) }))} />
      </div>
      <p className="text-xs text-muted">Search and status filters apply to the loaded page. Your results are always scoped to your account.</p>

      {query.isPending ? <div className="grid gap-3 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-48" />)}</div>
        : query.isError ? <div className="rounded-2xl border border-line bg-surface/70"><ErrorState message={(query.error as ApiError).message} onRetry={() => void query.refetch()} /></div>
          : !query.data?.total ? <div className="rounded-2xl border border-line bg-surface/70"><EmptyState icon={<Repeat />} title="No subscriptions yet" description="Your subscriptions will appear here when a plan is set up for your account." /></div>
            : !visible.length ? <div className="rounded-2xl border border-line bg-surface/70"><EmptyState title="No matches on this page" description="Try another search or status, or browse another page." action={<Button size="sm" variant="secondary" onClick={list.reset}>Clear filters</Button>} /></div>
              : <div className="grid gap-3 md:grid-cols-2">{visible.map((subscription) => <SubscriptionCard key={subscription.id} subscription={subscription} />)}</div>}

      {query.data && query.data.total > 0 && <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/70 px-4 py-3">
        <p className="text-sm text-muted">Page {query.data.page} of {pageCount} · {query.data.total} subscriptions</p>
        <div className="flex gap-2"><Button size="sm" variant="secondary" aria-label="Previous page" disabled={query.data.page <= 1 || query.isFetching} onClick={() => list.setPage(query.data!.page - 1)}><ChevronLeft /> Previous</Button><Button size="sm" variant="secondary" aria-label="Next page" disabled={query.data.page >= pageCount || query.isFetching} onClick={() => list.setPage(query.data!.page + 1)}>Next <ChevronRight /></Button></div>
      </div>}
    </section>
  </div>;
}

function SubscriptionCard({ subscription }: { subscription: PortalSubscription }) {
  const billing = subscription.billing_period
    ? `${subscription.billing_period}${subscription.billing_interval && subscription.billing_interval > 1 ? ` · every ${subscription.billing_interval}` : ""}`
    : "Billing schedule not provided";
  const amount = subscription.monthly_amount ?? subscription.total;
  return <article className="rounded-2xl border border-line bg-surface/70 p-5 transition hover:border-primary/40">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="truncate font-semibold">{subscription.plan_name || "Subscription plan"}</p><p className="mt-1 text-sm text-muted">{subscription.subscription_number}</p></div>
      <StatusBadge status={subscription.status} />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
      <Detail label="Billing" value={billing} />
      <Detail label="Monthly equivalent" value={formatCurrency(num(amount))} />
      <Detail label="Started" value={subscription.start_date === undefined ? "Not provided" : subscription.start_date ? formatDate(subscription.start_date) : "Not started"} />
      <Detail label="Ends" value={subscription.end_date === undefined ? "Not provided" : subscription.end_date ? formatDate(subscription.end_date) : "No end date"} />
      <Detail label="Next billing" value={subscription.next_billing_date ? formatDate(subscription.next_billing_date) : "Not scheduled"} />
    </div>
    <Link to={`/portal/subscriptions/${subscription.id}`} className="mt-4 inline-flex min-h-10 items-center font-semibold text-primary hover:underline">View details <ChevronRight className="ml-1 size-4" aria-hidden /></Link>
  </article>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="truncate font-medium">{value}</p></div>;
}
