import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, FileText, Pencil, Play, RefreshCw, XCircle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, Skeleton } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { planService } from "@/services/planService";
import { subscriptionService } from "@/services/subscriptionService";
import type { Plan } from "@/types/plan";
import type { SubscriptionAction, SubscriptionLine, SubscriptionStatus } from "@/types/subscription";

const STEP_ORDER: SubscriptionStatus[] = ["draft", "quotation", "confirmed", "active", "closed"];

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-sm font-medium text-ink">{value}</p></div>;
}

function SubscriptionLineCard({ line, index }: { line: SubscriptionLine; index: number }) {
  const product = useQuery({ queryKey: ["subscription-product", line.product_id], queryFn: () => subscriptionService.product(line.product_id) });
  const plan = useQuery({ queryKey: ["plan", line.plan_id], queryFn: () => planService.getById(line.plan_id!), enabled: Boolean(line.plan_id) });
  const productName = line.product_name ?? line.description ?? product.data?.name ?? `Product ${line.product_id}`;
  const variant = product.data?.attributes.flatMap((attribute) => attribute.values.map((value) => ({ ...value, attribute: attribute.name }))).find((value) => value.id === line.product_attribute_value_id);
  return <article className="rounded-xl border border-line bg-surface-2/25 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{productName}</h3>{line.variant_name || variant ? <p className="mt-0.5 text-xs text-muted">{line.variant_name ?? `${variant!.attribute}: ${variant!.value}`}</p> : line.product_attribute_value_id ? <p className="mt-0.5 text-xs text-muted">Variant ID {line.product_attribute_value_id}</p> : null}<p className="mt-1 text-xs text-muted">{line.plan_name ?? plan.data?.name ?? (line.plan_id ? `Plan ${line.plan_id}` : "No plan")}</p></div><p className="text-right text-sm font-semibold">{formatCurrency(Number(line.line_total))}</p></div>
    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-4"><Info label="Quantity" value={line.quantity} /><Info label="Unit price" value={formatCurrency(Number(line.unit_price))} /><Info label="Discount" value={formatCurrency(Number(line.discount_amount))} /><Info label="Tax" value={formatCurrency(Number(line.tax_amount))} /></div>
    {product.isError && <p className="mt-2 text-xs text-warning">Product details could not be loaded. <button className="underline" onClick={() => void product.refetch()}>Retry</button></p>}
    {plan.isError && <p className="mt-2 text-xs text-warning">Plan details could not be loaded. <button className="underline" onClick={() => void plan.refetch()}>Retry</button></p>}
    <span className="sr-only">Line {index + 1}</span>
  </article>;
}

function actionTitle(action: SubscriptionAction): string {
  return ({ confirm: "Confirm subscription", activate: "Activate subscription", pause: "Pause subscription", resume: "Resume subscription", renew: "Renew subscription", close: "Close subscription" })[action];
}

function actionDescription(action: SubscriptionAction): string {
  return ({
    confirm: "Confirm this subscription. The backend will reject an expired quotation.",
    activate: "Activate this subscription. Activation sets its next billing date; it does not generate an invoice.",
    pause: "Pause service for this subscription. The linked plans must allow pausing.",
    resume: "Resume this paused subscription. The backend will check plan restrictions.",
    renew: "Renew this subscription. Renewal is explicit and uses the linked plan billing schedule.",
    close: "Close this subscription immediately. The end date will be set to today.",
  })[action];
}

export default function SubscriptionDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState<SubscriptionAction | null>(null);
  const query = useQuery({ queryKey: ["subscription", id], queryFn: () => subscriptionService.get(id), enabled: Boolean(id) });
  const subscription = query.data;
  const customer = useQuery({ queryKey: ["subscription-customer", subscription?.customer_id], queryFn: () => subscriptionService.customer(subscription!.customer_id), enabled: Boolean(subscription?.customer_id) });
  const planQueries = useQueries({ queries: (subscription?.lines ?? []).filter((line) => line.plan_id).map((line) => ({ queryKey: ["plan", line.plan_id], queryFn: () => planService.getById(line.plan_id!) })) });
  const invoiceQuery = useQuery({ queryKey: ["subscription-invoices", id], queryFn: () => subscriptionService.invoices(id), enabled: Boolean(subscription) });
  const lifecycle = useMutation({
    mutationFn: (action: SubscriptionAction) => subscriptionService.action(id, action),
    onSuccess: (updated) => { void client.invalidateQueries({ queryKey: ["subscription", id] }); void client.invalidateQueries({ queryKey: ["subscriptions"] }); setConfirming(null); toast.success(`${updated.subscription_number} ${updated.status}.`); },
    onError: (error: Error) => { setConfirming(null); toast.error(error.message || "The requested subscription action failed."); },
  });
  if (query.isPending) return <div className="space-y-5"><Skeleton className="h-10 w-72" /><Skeleton className="h-52 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  if (query.isError || !subscription) return <ErrorState message={query.error instanceof Error ? query.error.message : "Could not load subscription details."} onRetry={() => void query.refetch()} />;
  const plans = planQueries.map((result) => result.data).filter((plan): plan is Plan => Boolean(plan));
  const plansReady = planQueries.every((result) => !result.isPending && !result.isError);
  const canPause = plansReady && plans.every((plan) => plan.is_pausable !== false);
  const canResume = plansReady && plans.every((plan) => plan.is_renewable !== false);
  const canRenew = plansReady && plans.every((plan) => plan.is_renewable !== false);
  const canClose = plansReady && (plans.every((plan) => plan.allows_early_closure) || Boolean(subscription.end_date && subscription.end_date <= new Date().toISOString().slice(0, 10)));
  const actions: SubscriptionAction[] = [];
  if (["draft", "quotation"].includes(subscription.status)) actions.push("confirm");
  if (subscription.status === "confirmed") actions.push("activate");
  if (subscription.status === "active" && canPause) actions.push("pause");
  if (subscription.status === "paused" && canResume) actions.push("resume");
  if (subscription.status === "active" && canRenew) actions.push("renew");
  if (["draft", "quotation", "confirmed", "active", "paused"].includes(subscription.status) && canClose) actions.push("close");
  const currentStep = subscription.status === "paused" ? STEP_ORDER.indexOf("active") : STEP_ORDER.indexOf(subscription.status);
  return <div className="space-y-6">
    <PageHeader back={{ to: "/subscriptions", label: "Back to Subscriptions" }} title={subscription.subscription_number} description={customer.data ? `${customer.data.name}${customer.data.company ? ` · ${customer.data.company}` : ""}` : `Customer ${subscription.customer_id}`} actions={<div className="flex flex-wrap items-center gap-2"><StatusBadge status={subscription.status} />{["draft", "quotation"].includes(subscription.status) && <Button variant="secondary" size="sm" onClick={() => navigate(`/subscriptions/${id}/edit`)}><Pencil className="size-4" /> Edit</Button>}{actions.map((action) => <Button key={action} size="sm" variant={action === "close" ? "danger" : "secondary"} onClick={() => setConfirming(action)}>{action === "activate" ? <Play className="size-4" /> : action === "renew" ? <RefreshCw className="size-4" /> : action === "close" ? <XCircle className="size-4" /> : null}{actionTitle(action).replace(" subscription", "")}</Button>)}</div>} />
    {!plansReady && !planQueries.some((result) => result.isError) && <p className="text-xs text-muted">Loading plan restrictions before showing lifecycle actions…</p>}
    {planQueries.some((result) => result.isError) && <Alert tone="info">Plan restrictions could not be loaded, so lifecycle actions are hidden. <button className="underline" onClick={() => void Promise.all(planQueries.map((result) => result.refetch()))}>Retry</button></Alert>}
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">Lifecycle</h2>
      <div className="flex flex-wrap items-center gap-2">{STEP_ORDER.map((step, index) => <div key={step} className="flex items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index <= currentStep ? "bg-gradient-to-r from-primary to-accent text-white" : "bg-surface-2 text-muted"}`}>{step[0].toUpperCase() + step.slice(1)}</span>{index < STEP_ORDER.length - 1 && <span className="text-muted">→</span>}</div>)}{subscription.status === "paused" && <span className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent">Paused</span>}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Info label="Start date" value={subscription.start_date ? formatDate(subscription.start_date) : "Not started"} /><Info label="End date" value={subscription.end_date ? formatDate(subscription.end_date) : "—"} /><Info label="Next billing" value={subscription.next_billing_date ? formatDate(subscription.next_billing_date) : "Not scheduled"} /><Info label="Billing schedule" value={subscription.billing_period ? `${subscription.billing_period}${subscription.billing_interval && subscription.billing_interval > 1 ? ` · every ${subscription.billing_interval}` : ""}` : "—"} /></div>
    </section>
    <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-4 font-semibold">Customer</h2>{customer.isError ? <ErrorState message="Could not load customer details." onRetry={() => void customer.refetch()} /> : <div className="grid gap-4 sm:grid-cols-2"><Info label="Name" value={customer.data?.name ?? subscription.customer_name ?? "Loading customer…"} /><Info label="Email" value={customer.data?.email ?? subscription.customer_email ?? "—"} /><Info label="Company" value={customer.data?.company ?? "—"} /><Info label="Customer ID" value={subscription.customer_id} /></div>}</div>
      <div className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-4 font-semibold">Totals</h2><dl className="space-y-3 text-sm"><div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatCurrency(Number(subscription.subtotal))}</dd></div><div className="flex justify-between"><dt className="text-muted">Discount</dt><dd>−{formatCurrency(Number(subscription.discount_total))}</dd></div><div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{formatCurrency(Number(subscription.tax_total))}</dd></div><div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Total</dt><dd>{formatCurrency(Number(subscription.total))}</dd></div></dl></div>
    </section>
    <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-4 font-semibold">Product lines</h2><div className="space-y-3">{subscription.lines.map((line, index) => <SubscriptionLineCard key={line.id ?? index} line={line} index={index} />)}</div></section>
    <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><FileText className="size-4 text-primary" /> Invoices</h2>{invoiceQuery.isPending ? <Skeleton className="h-20" /> : invoiceQuery.isError ? <Alert tone="info">{invoiceQuery.error instanceof Error ? invoiceQuery.error.message : "Could not load invoices."} <button className="ml-1 underline" onClick={() => void invoiceQuery.refetch()}>Retry</button></Alert> : invoiceQuery.data?.items.length ? <div className="space-y-2">{invoiceQuery.data.items.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2/30 px-4 py-3 text-sm"><div><p className="font-semibold">{invoice.invoice_number}</p><p className="text-xs text-muted">{formatDate(invoice.invoice_date)} · Due {formatDate(invoice.due_date)}</p></div><div className="flex items-center gap-3"><StatusBadge status={invoice.status} /><span className="font-semibold">{formatCurrency(Number(invoice.total))}</span></div></div>)}</div> : <p className="text-sm text-muted">No invoices are linked to this subscription yet.</p>}</section>
    <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Clock3 className="size-4 text-primary" /> History</h2>{subscription.history?.length ? <ol className="space-y-4">{subscription.history.map((entry, index) => <li key={`${entry.created_at}-${index}`} className="flex gap-3"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm font-medium">{entry.action ?? "Status change"}{entry.previous_status ? ` · ${entry.previous_status} → ${entry.new_status}` : entry.new_status ? ` · ${entry.new_status}` : ""}</p>{entry.notes && <p className="mt-0.5 text-sm text-muted">{entry.notes}</p>}{entry.created_at && <p className="mt-0.5 text-xs text-muted">{formatDateTime(entry.created_at)}</p>}</div></li>)}</ol> : <p className="text-sm text-muted">No history entries were returned.</p>}</section>
    <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarDays className="size-4 text-primary" /> Notes</h2><p className="whitespace-pre-wrap text-sm text-muted">{subscription.notes || "No notes."}</p>{subscription.quotation_valid_until && <p className="mt-3 text-xs text-muted">Quotation valid until {formatDate(subscription.quotation_valid_until)}</p>}</section>
    <ConfirmDialog open={Boolean(confirming)} onClose={() => setConfirming(null)} onConfirm={() => confirming && lifecycle.mutate(confirming)} loading={lifecycle.isPending} tone={confirming === "close" ? "danger" : "primary"} title={confirming ? actionTitle(confirming) : "Confirm action"} description={confirming ? actionDescription(confirming) : undefined} confirmLabel={confirming ? actionTitle(confirming).replace(" subscription", "") : "Confirm"} />
  </div>;
}
