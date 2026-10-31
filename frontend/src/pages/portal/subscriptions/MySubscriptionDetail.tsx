import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState, Skeleton } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { portalService } from "@/services/portalService";
import type { ApiError } from "@/services/api";
import type { PortalSubscription } from "@/types/portal";

type Action = "pause" | "resume" | "close" | "renew";

export default function MySubscriptionDetail() {
  const { id = "" } = useParams();
  const [closeOpen, setCloseOpen] = useState(false);
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery<PortalSubscription, ApiError>({
    queryKey: ["portal", "subscription", id], queryFn: () => portalService.subscription(id), enabled: Boolean(id),
  });
  const action = useMutation<unknown, ApiError, Action>({
    mutationFn: (kind) => portalService.subscriptionAction(id, kind),
    onSuccess: (_, kind) => {
      toast.success(kind === "close" ? "Subscription closed" : kind === "renew" ? "Subscription renewed" : `Subscription ${kind}d`);
      setCloseOpen(false);
      void client.invalidateQueries({ queryKey: ["portal", "subscription", id] });
      void client.invalidateQueries({ queryKey: ["portal", "subscriptions"] });
      void client.invalidateQueries({ queryKey: ["portal", "summary"] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-64" /></div>;
  if (query.isError || !query.data) return <><PageHeader title="Subscription" back={{ to: "/portal/subscriptions", label: "My subscriptions" }} /><ErrorState message={query.error?.message ?? "Subscription not found."} onRetry={() => void query.refetch()} /></>;
  const subscription = query.data;
  const canPause = subscription.is_pausable && subscription.status === "active";
  const canResume = subscription.is_pausable && subscription.status === "paused";
  const canClose = subscription.allows_early_closure && !["closed", "draft"].includes(subscription.status);
  const canRenew = subscription.is_renewable && subscription.status !== "draft";
  return <>
    <PageHeader title={subscription.plan_name || subscription.subscription_number} description={subscription.subscription_number}
      back={{ to: "/portal/subscriptions", label: "My subscriptions" }} actions={<StatusBadge status={subscription.status} />} />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="space-y-4 rounded-2xl border border-line bg-surface/70 p-5">
        <div className="grid gap-4 sm:grid-cols-2"><Info label="Billing period" value={subscription.billing_period ?? "—"} />
          <Info label="Next billing date" value={subscription.next_billing_date ? formatDate(subscription.next_billing_date) : "—"} />
          <Info label="Current amount" value={formatCurrency(subscription.total)} /></div>
        <div><h2 className="mb-3 font-semibold">Included items</h2>{subscription.lines?.length ? <ul className="divide-y divide-line/60 rounded-xl border border-line">{subscription.lines.map((line, index) => <li key={`${line.product_id}-${index}`} className="flex justify-between gap-4 px-4 py-3 text-sm"><span>{line.product_name || line.description || "Subscription item"} <span className="text-muted">× {line.quantity}</span></span><span className="font-medium">{formatCurrency(line.line_total)}</span></li>)}</ul> : <p className="text-sm text-muted">No line details are available.</p>}</div>
      </section>
      <aside className="h-fit space-y-3 rounded-2xl border border-line bg-surface/70 p-5"><h2 className="font-semibold">Manage subscription</h2>
        {canPause && <Button variant="secondary" block loading={action.isPending} onClick={() => action.mutate("pause")}>Pause subscription</Button>}
        {canResume && <Button variant="secondary" block loading={action.isPending} onClick={() => action.mutate("resume")}>Resume subscription</Button>}
        {canRenew && <Button variant="secondary" block loading={action.isPending} onClick={() => action.mutate("renew")}>Renew subscription</Button>}
        {canClose && <Button variant="danger" block loading={action.isPending} onClick={() => setCloseOpen(true)}>Request closure</Button>}
        {!canPause && !canResume && !canRenew && !canClose && <p className="text-sm text-muted">No self-service actions are available for this plan.</p>}
        <Link className="block pt-1 text-center text-sm font-medium text-primary hover:underline" to="/portal/invoices">View invoices</Link>
      </aside>
    </div>
    <ConfirmDialog open={closeOpen} onClose={() => setCloseOpen(false)} onConfirm={() => action.mutate("close")} loading={action.isPending}
      tone="danger" title="Close this subscription?" description="You may lose access to the services in this plan. This action may not be reversible." confirmLabel="Close subscription" />
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-line bg-surface-2/30 p-4"><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
