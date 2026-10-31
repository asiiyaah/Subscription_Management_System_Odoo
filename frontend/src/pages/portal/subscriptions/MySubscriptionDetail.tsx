import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileText, RefreshCw } from "lucide-react";
import { ErrorState, Skeleton } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { num } from "@/services/api";
import { portalService } from "@/services/portalService";
import type { ApiError } from "@/services/api";
import type { PortalSubscription } from "@/types/portal";

type Action = "pause" | "resume" | "close" | "renew";
const ACTION_COPY: Record<Action, { title: string; confirm: string; description: string }> = {
  pause: { title: "Pause this subscription?", confirm: "Pause subscription", description: "Billing and access may be affected while the subscription is paused." },
  resume: { title: "Resume this subscription?", confirm: "Resume subscription", description: "This will reactivate the subscription according to its plan terms." },
  renew: { title: "Renew this subscription?", confirm: "Renew subscription", description: "The backend will update the next billing date for this subscription." },
  close: { title: "Close this subscription?", confirm: "Close subscription", description: "You may lose access to the services in this plan. This action may not be reversible." },
};

export default function MySubscriptionDetail() {
  const { id = "" } = useParams();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery<PortalSubscription, ApiError>({
    queryKey: ["portal", "subscription", id],
    queryFn: () => portalService.subscription(id),
    enabled: Boolean(id),
  });
  const action = useMutation<unknown, ApiError, Action>({
    mutationFn: (kind) => portalService.subscriptionAction(id, kind),
    onSuccess: (_, kind) => {
      toast.success(kind === "close" ? "Subscription closed" : kind === "renew" ? "Subscription renewed" : `Subscription ${kind}d`);
      setConfirming(null);
      void client.invalidateQueries({ queryKey: ["portal", "subscription", id] });
      void client.invalidateQueries({ queryKey: ["portal", "subscriptions"] });
      void client.invalidateQueries({ queryKey: ["portal", "summary"] });
    },
    onError: (error) => { toast.error(error.message || "The requested action could not be completed."); setConfirming(null); },
  });

  if (query.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /><Skeleton className="h-52" /></div>;
  if (query.isError || !query.data) return <><PageHeader title="Subscription" back={{ to: "/portal/subscriptions", label: "My subscriptions" }} /><ErrorState message={query.error?.message ?? "Subscription not found."} onRetry={() => void query.refetch()} /></>;

  const subscription = query.data;
  const endDatePassed = Boolean(subscription.end_date && subscription.end_date <= new Date().toISOString().slice(0, 10));
  const canPause = subscription.status === "active" && subscription.is_pausable === true;
  const canResume = subscription.status === "paused" && subscription.is_renewable === true;
  const canRenew = ["active", "closed"].includes(subscription.status) && subscription.is_renewable === true;
  const canClose = subscription.status !== "closed" && (subscription.allows_early_closure === true || endDatePassed);
  const interval = subscription.billing_period
    ? `${subscription.billing_period}${subscription.billing_interval && subscription.billing_interval > 1 ? ` · every ${subscription.billing_interval}` : ""}`
    : "Not provided";

  return <div className="space-y-5">
    <PageHeader title={subscription.plan_name || subscription.subscription_number} description={subscription.subscription_number}
      back={{ to: "/portal/subscriptions", label: "My subscriptions" }} actions={<StatusBadge status={subscription.status} />} />

    <section className="rounded-2xl border border-line bg-surface/70 p-5">
      <h2 className="mb-4 font-semibold">Subscription and billing</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Start date" value={subscription.start_date === undefined ? "Not provided" : subscription.start_date ? formatDate(subscription.start_date) : "Not started"} />
        <Info label="End date" value={subscription.end_date === undefined ? "Not provided" : subscription.end_date ? formatDate(subscription.end_date) : "No end date"} />
        <Info label="Billing period" value={interval} />
        <Info label="Next billing date" value={subscription.next_billing_date ? formatDate(subscription.next_billing_date) : "Not scheduled"} />
        <Info label="Monthly equivalent" value={subscription.monthly_amount !== undefined ? formatCurrency(num(subscription.monthly_amount)) : "Not provided"} />
        <Info label="Subscription total" value={formatCurrency(num(subscription.total))} />
      </div>
    </section>

    <section className="rounded-2xl border border-line bg-surface/70 p-5">
      <h2 className="mb-4 font-semibold">Products and plan items</h2>
      {subscription.lines?.length ? <div className="space-y-3">{subscription.lines.map((line, index) => <article key={`${line.product_id}-${index}`} className="rounded-xl border border-line bg-surface/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{line.product_name || line.description || "Subscription item"}</p>{line.plan_name && <p className="text-sm text-muted">{line.plan_name}</p>}</div><p className="text-sm font-semibold">Line total {formatCurrency(num(line.line_total))}</p></div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <Detail label="Quantity" value={String(line.quantity)} />
          <Detail label="Unit price" value={line.unit_price === undefined ? "Not provided" : formatCurrency(num(line.unit_price))} />
          <Detail label="Discount" value={line.discount_amount === undefined ? "Not provided" : formatCurrency(num(line.discount_amount))} />
          <Detail label="Tax" value={line.tax_amount === undefined ? "Not provided" : formatCurrency(num(line.tax_amount))} />
        </dl>
      </article>)}</div> : <p className="text-sm text-muted">No product line details were returned for this subscription.</p>}
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-line bg-surface/70 p-5"><h2 className="mb-4 font-semibold">Amount summary</h2><dl className="space-y-3 text-sm">
        <Amount label="Subtotal" value={subscription.subtotal} />
        <Amount label="Discount" value={subscription.discount_total} />
        <Amount label="Tax" value={subscription.tax_total} />
        <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Total</dt><dd>{formatCurrency(num(subscription.total))}</dd></div>
      </dl></section>
      <section className="rounded-2xl border border-line bg-surface/70 p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><CalendarClock className="size-4 text-primary" aria-hidden />Manage subscription</h2>
        <div className="flex flex-wrap gap-2">
          {canPause && <Button variant="secondary" loading={action.isPending} onClick={() => setConfirming("pause")}>Pause subscription</Button>}
          {canResume && <Button variant="secondary" loading={action.isPending} onClick={() => setConfirming("resume")}>Resume subscription</Button>}
          {canRenew && <Button variant="secondary" loading={action.isPending} onClick={() => setConfirming("renew")}><RefreshCw aria-hidden /> Renew subscription</Button>}
          {canClose && <Button variant="danger" loading={action.isPending} onClick={() => setConfirming("close")}>Request closure</Button>}
          {!canPause && !canResume && !canRenew && !canClose && <p className="text-sm text-muted">No self-service action is currently available for this plan and status.</p>}
        </div>
        <p className="mt-3 text-xs text-muted">Available actions follow this plan’s options and your subscription status.</p>
      </section>
    </section>

    <section className="rounded-2xl border border-line bg-surface/70 p-5">
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><FileText className="size-4 text-primary" aria-hidden />Invoices</h2>
      <p className="text-sm text-muted">The portal API does not currently filter invoices by subscription. You can review all invoices for your account.</p>
      <Link to="/portal/invoices" className="mt-3 inline-flex min-h-10 items-center font-semibold text-primary hover:underline">View my invoices</Link>
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-line bg-surface/70 p-5"><h2 className="mb-3 font-semibold">Notes</h2><p className="whitespace-pre-wrap text-sm text-muted">{subscription.notes || "No notes provided."}</p></section>
      <section className="rounded-2xl border border-line bg-surface/70 p-5"><h2 className="mb-3 font-semibold">Subscription history</h2>
        {subscription.history?.length ? <ol className="space-y-3">{subscription.history.map((entry, index) => <li key={`${entry.created_at}-${index}`} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm font-medium">{entry.action ?? "Status update"}{entry.previous_status ? ` · ${entry.previous_status} → ${entry.new_status}` : entry.new_status ? ` · ${entry.new_status}` : ""}</p>{entry.notes && <p className="mt-0.5 text-sm text-muted">{entry.notes}</p>}{entry.created_at && <p className="mt-0.5 text-xs text-muted">{formatDateTime(entry.created_at)}</p>}</div></li>)}</ol> : <p className="text-sm text-muted">No history entries were returned.</p>}
      </section>
    </section>

    <ConfirmDialog open={Boolean(confirming)} onClose={() => setConfirming(null)} onConfirm={() => confirming && action.mutate(confirming)} loading={action.isPending}
      tone={confirming === "close" ? "danger" : "primary"} title={confirming ? ACTION_COPY[confirming].title : "Confirm action"} description={confirming ? ACTION_COPY[confirming].description : undefined} confirmLabel={confirming ? ACTION_COPY[confirming].confirm : "Confirm"} />
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-line bg-surface-2/30 p-4"><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 font-medium">{value}</dd></div>;
}

function Amount({ label, value }: { label: string; value?: number | string }) {
  return <div className="flex justify-between"><dt className="text-muted">{label}</dt><dd>{value === undefined ? "Not provided" : formatCurrency(num(value))}</dd></div>;
}
