import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Repeat } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { portalService } from "@/services/portalService";
import type { ApiError } from "@/services/api";
import type { Paginated } from "@/types/common";
import type { PortalSubscription } from "@/types/portal";

export default function MySubscriptions() {
  const query = useQuery<Paginated<PortalSubscription>, ApiError>({
    queryKey: ["portal", "subscriptions"], queryFn: () => portalService.subscriptions(),
  });
  return <>
    <PageHeader title="My subscriptions" description="Plans and billing dates for your account." />
    <section className="overflow-hidden rounded-2xl border border-line bg-surface/70">
      {query.isPending ? <div className="space-y-3 p-5">{[1, 2, 3].map((n) => <Skeleton key={n} className="h-20" />)}</div>
        : query.isError ? <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        : !query.data.items.length ? <EmptyState icon={<Repeat />} title="No subscriptions yet" description="Your subscriptions will appear here once a plan is set up." />
        : <ul className="divide-y divide-line/60">{query.data.items.map((subscription) => <li key={subscription.id}>
          <Link to={`/portal/subscriptions/${subscription.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-surface-2/40">
            <div className="min-w-0 flex-1"><p className="font-semibold">{subscription.plan_name || subscription.subscription_number}</p>
              <p className="text-xs text-muted">{subscription.subscription_number}{subscription.next_billing_date && ` · next bill ${formatDate(subscription.next_billing_date)}`}</p></div>
            <span className="font-semibold tabular-nums">{formatCurrency(subscription.total)}</span><StatusBadge status={subscription.status} /><ChevronRight className="size-4 text-muted" aria-hidden />
          </Link>
        </li>)}</ul>}
    </section>
  </>;
}
