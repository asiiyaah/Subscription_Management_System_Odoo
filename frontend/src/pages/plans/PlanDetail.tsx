import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, Package, Pencil } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, Skeleton } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/Button";
import { PlanFormDialog } from "@/components/plans/PlanFormDialog";
import { useIsAdmin } from "@/context/AuthContext";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPlanAvailability } from "@/mocks/plans";
import { planService } from "@/services/planService";
import { productService } from "@/services/productService";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-sm font-medium text-ink">{value}</p></div>;
}

export default function PlanDetail() {
  const { id = "" } = useParams();
  const admin = useIsAdmin();
  const [formOpen, setFormOpen] = useState(false);
  const planQuery = useQuery({ queryKey: ["plan", id], queryFn: () => planService.getById(id), enabled: Boolean(id) });
  const productQuery = useQuery({ queryKey: ["product", "plan", planQuery.data?.product_id], queryFn: () => productService.getById(planQuery.data!.product_id), enabled: Boolean(planQuery.data?.product_id && !planQuery.data.product) });
  if (planQuery.isPending) return <div className="space-y-5"><Skeleton className="h-10 w-64" /><Skeleton className="h-52 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div>;
  if (planQuery.isError || !planQuery.data) return <ErrorState message={planQuery.error instanceof Error ? planQuery.error.message : "Could not load plan details."} onRetry={() => void planQuery.refetch()} />;
  const plan = planQuery.data;
  const productName = plan.product?.name ?? productQuery.data?.name;
  const billingUnit = ({ daily: "day", weekly: "week", monthly: "month", yearly: "year" } as const)[plan.billing_period];
  return <div className="space-y-6">
    <PageHeader back={{ to: "/plans", label: "Back to Plans" }} title={plan.name} description={plan.description || "Plan details and subscription options."} actions={admin ? <Button variant="secondary" onClick={() => setFormOpen(true)}><Pencil className="size-4" /> Edit plan</Button> : undefined} />
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted">Plan price</p><p className="mt-1 text-3xl font-bold text-ink">{formatCurrency(Number(plan.price))}</p><p className="mt-1 text-sm text-muted">{(plan.billing_interval ?? 1) > 1 ? `Every ${plan.billing_interval} ${billingUnit}s` : `Per ${plan.billing_period}`}</p></div><StatusBadge status={plan.status ?? "unknown"} /></div>
      <div className="mt-6 grid gap-5 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-4"><Info label="Availability" value={getPlanAvailability(plan)} /><Info label="Available from" value={plan.start_date ? formatDate(plan.start_date) : "No start date"} /><Info label="Available until" value={plan.end_date ? formatDate(plan.end_date) : "No end date"} /><Info label="Trial" value={`${plan.trial_days ?? 0} days`} /></div>
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-5 flex items-center gap-2 font-semibold"><Package className="size-4 text-primary" /> Associated product</h2>{productQuery.isError && !productName ? <ErrorState message="Could not load the associated product." onRetry={() => void productQuery.refetch()} /> : <div className="rounded-xl bg-surface-2/40 p-4"><p className="font-semibold">{productName ?? (productQuery.isPending ? "Loading product…" : "Product details unavailable")}</p><p className="mt-1 text-xs text-muted">Product ID: {plan.product_id}</p></div>}</div>
      <div className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-5 flex items-center gap-2 font-semibold"><Clock3 className="size-4 text-primary" /> Plan options</h2><dl className="grid grid-cols-2 gap-4"><Info label="Minimum quantity" value={plan.minimum_quantity} /><Info label="Auto-close at end" value={plan.auto_close ? "Yes" : "No"} /><Info label="Can close early" value={plan.allows_early_closure ? "Yes" : "No"} /><Info label="Can pause" value={plan.is_pausable ? "Yes" : "No"} /><Info label="Can renew" value={plan.is_renewable ? "Yes" : "No"} /><Info label="Active subscribers" value={plan.active_subscribers ?? "—"} /></dl></div>
    </section>
    <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><CalendarDays className="size-4 text-primary" /> Record information</h2><div className="grid gap-4 sm:grid-cols-2"><Info label="Created" value={plan.created_at ? formatDate(plan.created_at) : "—"} /><Info label="Last updated" value={plan.updated_at ? formatDate(plan.updated_at) : "—"} /></div></section>
    {admin && <PlanFormDialog open={formOpen} plan={plan} onClose={() => setFormOpen(false)} />}
  </div>;
}
