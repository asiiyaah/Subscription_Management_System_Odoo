import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarDays, Eye, LayoutGrid, List, Pencil, Plus, RotateCcw } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import { PlanFormDialog } from "@/components/plans/PlanFormDialog";
import { useListQuery } from "@/hooks/useListQuery";
import { useIsAdmin } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPlanAvailability } from "@/mocks/plans";
import { planService } from "@/services/planService";
import { productService } from "@/services/productService";
import { USE_MOCKS } from "@/services/api";
import type { Plan, PlanListQuery } from "@/types/plan";

const PERIODS = ["daily", "weekly", "monthly", "yearly"] as const;
const periodUnit: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
const periodLabel = (period: string, interval: number | null) => `${(interval ?? 1) > 1 ? `Every ${interval} ` : "per "}${periodUnit[period] ?? period}${(interval ?? 1) > 1 ? "s" : ""}`;
const dateRange = (plan: Plan) => {
  if (!plan.start_date && !plan.end_date) return "No availability dates set";
  return `${plan.start_date ? formatDate(plan.start_date) : "Anytime"} – ${plan.end_date ? formatDate(plan.end_date) : "Ongoing"}`;
};

export default function Plans() {
  const navigate = useNavigate();
  const admin = useIsAdmin();
  const client = useQueryClient();
  const toast = useToast();
  const list = useListQuery({ sortBy: "name" });
  const query = list.query as PlanListQuery;
  const [view, setView] = useState<"cards" | "table">("cards");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [statusTarget, setStatusTarget] = useState<Plan | null>(null);
  const plans = useQuery({ queryKey: ["plans", "list", query], queryFn: () => planService.list(query) });
  const products = useQuery({ queryKey: ["products", "plan-filter"], queryFn: () => productService.list({ page: 1, page_size: 50, sort_by: "name", sort_dir: "asc" }) });
  const statusMutation = useMutation({
    mutationFn: async (plan: Plan) => {
      if (plan.status === "active") await planService.archive(plan.id);
      else await planService.restore(plan.id);
    },
    onSuccess: (_, plan) => { void client.invalidateQueries({ queryKey: ["plans"] }); void client.invalidateQueries({ queryKey: ["plan", plan.id] }); toast.success(plan.status === "active" ? "Plan archived." : "Plan restored."); setStatusTarget(null); },
    onError: (error: Error) => toast.error(error.message),
  });
  const columns: Column<Plan>[] = [
    { key: "name", header: "Plan", sortable: true, render: (plan) => <div className="min-w-36"><p className="font-semibold text-ink">{plan.name}</p><p className="text-xs text-muted">{plan.product?.name ?? products.data?.items.find((product) => String(product.id) === String(plan.product_id))?.name ?? "Product"}</p></div> },
    { key: "price", header: "Price", sortable: true, align: "right", render: (plan) => <span className="font-semibold">{formatCurrency(Number(plan.price))}</span> },
    { key: "billing_period", header: "Billing", sortable: true, render: (plan) => periodLabel(plan.billing_period, plan.billing_interval) },
    { key: "minimum_quantity", header: "Min. qty", align: "right", render: (plan) => plan.minimum_quantity },
    { key: "availability", header: "Availability", render: (plan) => <span className="text-xs text-muted">{dateRange(plan)}</span> },
    { key: "status", header: "Status", render: (plan) => <StatusBadge status={plan.status} /> },
  ];
  function openForm(plan: Plan | null = null) { setEditing(plan); setFormOpen(true); }
  const pageCount = Math.max(1, Math.ceil((plans.data?.total ?? 0) / (plans.data?.page_size ?? query.page_size)));
  return <div className="space-y-6">
    <PageHeader title="Plans" description="Set pricing, billing schedules and subscription options for your products." actions={<div className="flex items-center gap-2"><div className="flex rounded-xl border border-line p-1"><Button variant={view === "cards" ? "secondary" : "ghost"} size="sm" aria-label="Card view" onClick={() => setView("cards")}><LayoutGrid className="size-4" /></Button><Button variant={view === "table" ? "secondary" : "ghost"} size="sm" aria-label="Table view" onClick={() => setView("table")}><List className="size-4" /></Button></div>{admin && <Button onClick={() => openForm()}><Plus className="size-4" aria-hidden /> New plan</Button>}</div>} />
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/70 p-3 sm:p-4">
      <label className="relative min-w-52 flex-1 sm:max-w-xs"><span className="sr-only">Search plans</span><input type="search" value={list.searchInput} onChange={(event) => list.setSearchInput(event.target.value)} placeholder="Search plans…" className="h-10 w-full rounded-xl border border-line bg-surface-2/60 px-3 text-sm placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20" /></label>
      {USE_MOCKS && <Select aria-label="Filter billing period" className="w-40" options={PERIODS.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} placeholder="All billing periods" value={String(query.billing_period ?? "")} onChange={(event) => list.setFilter("billing_period", event.target.value || undefined)} />}
      {USE_MOCKS && <Select aria-label="Filter availability" className="w-44" options={[{ value: "available", label: "Available now" }, { value: "upcoming", label: "Upcoming" }, { value: "ended", label: "Ended" }]} placeholder="All availability" value={String(query.availability ?? "")} onChange={(event) => list.setFilter("availability", event.target.value || undefined)} />}
      <Select aria-label="Filter plan status" className="w-36" options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} placeholder="All statuses" value={String(query.status ?? "")} onChange={(event) => list.setFilter("status", event.target.value || undefined)} />
      <Select aria-label="Filter product" className="w-44" options={(products.data?.items ?? []).map((product) => ({ value: String(product.id), label: product.name }))} placeholder="All products" value={String(query.product_id ?? "")} onChange={(event) => list.setFilter("product_id", event.target.value || undefined)} />
    </div>
    {view === "table" ? <DataTable columns={columns} data={plans.data} isLoading={plans.isPending} isFetching={plans.isFetching} isError={plans.isError} errorMessage={plans.error instanceof Error ? plans.error.message : "Could not load plans."} onRetry={() => void plans.refetch()} list={list} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/plans/${p.id}`)} searchPlaceholder={false} empty={{ title: "No plans yet", description: "Create a plan to offer a product on a recurring basis.", action: admin ? <Button size="sm" onClick={() => openForm()}><Plus /> New plan</Button> : undefined }} rowActions={(plan) => [{ label: "View details", icon: <Eye className="size-4" />, onSelect: () => navigate(`/plans/${plan.id}`) }, ...(admin ? [{ label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => openForm(plan) }, { label: plan.status === "active" ? "Archive" : "Restore", icon: plan.status === "active" ? <Archive className="size-4" /> : <RotateCcw className="size-4" />, onSelect: () => setStatusTarget(plan) }] : [])]} /> : <>
      {plans.isError ? <div className="rounded-2xl border border-line bg-surface"><div className="p-4 text-center"><p className="font-semibold">Could not load plans</p><p className="mt-1 text-sm text-muted">{plans.error instanceof Error ? plans.error.message : "Please try again."}</p><Button className="mt-3" variant="secondary" size="sm" onClick={() => void plans.refetch()}>Try again</Button></div></div> : plans.isPending || !plans.data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-56 animate-pulse rounded-2xl border border-line bg-surface" />)}</div> : plans.data.items.length === 0 ? <div className="rounded-2xl border border-line bg-surface p-10 text-center"><p className="font-semibold">{query.search || query.status || query.billing_period || query.availability || query.product_id ? "No plans match these filters" : "No plans yet"}</p><p className="mt-1 text-sm text-muted">Create a plan to offer a product on a recurring basis.</p><Button className="mt-4" variant="secondary" size="sm" onClick={list.reset}>Clear filters</Button>{admin && !query.search && !query.status && !query.billing_period && !query.availability && !query.product_id && <Button className="ml-2 mt-4" size="sm" onClick={() => openForm()}><Plus /> New plan</Button>}</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{plans.data.items.map((plan) => <article key={plan.id} onClick={() => navigate(`/plans/${plan.id}`)} onKeyDown={(event) => { if (event.key === "Enter") navigate(`/plans/${plan.id}`); }} tabIndex={0} className="cursor-pointer rounded-2xl border border-line bg-surface p-5 transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-semibold">{plan.name}</h2><p className="mt-0.5 truncate text-sm text-muted">{plan.product?.name ?? products.data?.items.find((product) => String(product.id) === String(plan.product_id))?.name ?? "Product"}</p></div><StatusBadge status={plan.status} /></div>
        <div className="mt-5 rounded-xl bg-gradient-to-r from-primary/15 to-accent/15 p-4"><p className="text-2xl font-bold text-ink">{formatCurrency(Number(plan.price))}</p><p className="mt-0.5 text-sm text-muted">{periodLabel(plan.billing_period, plan.billing_interval)}</p></div>
        <div className="mt-4 flex items-start gap-2 text-sm text-muted"><CalendarDays className="mt-0.5 size-4 shrink-0" /><span>{dateRange(plan)}</span></div>
        <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">Min qty {plan.minimum_quantity}</span>{plan.auto_close && <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs text-warning">Auto-close</span>}{plan.is_pausable && <span className="rounded-full bg-violet/10 px-2.5 py-1 text-xs text-violet">Pausable</span>}{plan.is_renewable && <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs text-success">Renewable</span>}{plan.allows_early_closure && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">Closable</span>}</div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted"><span>{getPlanAvailability(plan)}</span><span>{plan.active_subscribers ?? 0} active subscribers</span></div>
        {admin && <div className="mt-3 flex justify-end gap-2" onClick={(event) => event.stopPropagation()}><Button variant="ghost" size="sm" onClick={() => openForm(plan)}><Pencil className="size-4" /> Edit</Button><Button variant="ghost" size="sm" onClick={() => setStatusTarget(plan)}>{plan.status === "active" ? <><Archive className="size-4" /> Archive</> : <><RotateCcw className="size-4" /> Restore</>}</Button></div>}
      </article>)}</div>}
      {plans.data && plans.data.total > 0 && <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted"><span>{plans.data.total} plans · Page {plans.data.page} of {pageCount}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={plans.data.page <= 1} onClick={() => list.setPage(plans.data!.page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={plans.data.page >= pageCount} onClick={() => list.setPage(plans.data!.page + 1)}>Next</Button></div></div>}
    </>}
    {admin && <PlanFormDialog open={formOpen} plan={editing} onClose={() => setFormOpen(false)} />}
    <ConfirmDialog open={Boolean(statusTarget)} onClose={() => setStatusTarget(null)} onConfirm={() => statusTarget && statusMutation.mutate(statusTarget)} loading={statusMutation.isPending} tone={statusTarget?.status === "active" ? "danger" : "primary"} title={statusTarget?.status === "active" ? `Archive ${statusTarget.name}?` : `Restore ${statusTarget?.name}?`} description={statusTarget?.status === "active" ? "Archived plans remain in existing records and can be restored later." : "This plan will be available for new subscriptions again."} confirmLabel={statusTarget?.status === "active" ? "Archive plan" : "Restore plan"} />
  </div>;
}
