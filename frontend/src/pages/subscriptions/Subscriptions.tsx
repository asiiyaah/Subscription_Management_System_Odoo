import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, Pencil, Plus, Repeat } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Tabs } from "@/components/common/Tabs";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useListQuery } from "@/hooks/useListQuery";
import { formatCurrency, formatDate } from "@/lib/format";
import { USE_MOCKS } from "@/services/api";
import { planService } from "@/services/planService";
import { subscriptionService } from "@/services/subscriptionService";
import type { Plan } from "@/types/plan";
import type { Subscription, SubscriptionListQuery, SubscriptionStatus } from "@/types/subscription";

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" }, { value: "draft", label: "Draft" }, { value: "quotation", label: "Quotation" },
  { value: "confirmed", label: "Confirmed" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "closed", label: "Closed" },
];
const statusOptions: SubscriptionStatus[] = ["draft", "quotation", "confirmed", "active", "paused", "closed"];

export default function Subscriptions() {
  const navigate = useNavigate();
  const list = useListQuery({ sortBy: "created_at", sortDir: "desc" });
  const query = list.query as SubscriptionListQuery;
  const status = statusOptions.includes(query.status as SubscriptionStatus) ? query.status! : "all";
  const subscriptions = useQuery({ queryKey: ["subscriptions", "list", query], queryFn: () => subscriptionService.list(query), placeholderData: keepPreviousData });
  const customers = useQuery({ queryKey: ["subscription-customers"], queryFn: () => subscriptionService.customers() });
  const plans = useQuery({ queryKey: ["subscription-plan-names"], queryFn: () => planService.list({ page: 1, page_size: 100 }) });
  const customerNames = new Map((customers.data ?? []).map((customer) => [customer.id, customer.name]));
  const planNames = new Map((plans.data?.items ?? []).map((plan: Plan) => [String(plan.id), plan.name]));
  const columns: Column<Subscription>[] = [
    { key: "subscription_number", header: "Number", sortable: true, render: (sub) => <span className="font-semibold text-primary">{sub.subscription_number}</span> },
    { key: "customer_name", header: "Customer", render: (sub) => <div><p className="font-medium">{sub.customer_name ?? customerNames.get(sub.customer_id) ?? `Customer ${sub.customer_id.slice(0, 8)}`}</p>{sub.customer_email && <p className="text-xs text-muted">{sub.customer_email}</p>}</div> },
    { key: "plan", header: "Plan / products", render: (sub) => <div className="max-w-56 truncate">{sub.lines.map((line) => line.plan_name ?? (line.plan_id ? planNames.get(line.plan_id) : undefined) ?? line.product_name ?? line.description ?? line.product_id).join(", ")}</div> },
    { key: "billing_period", header: "Billing", render: (sub) => sub.billing_period ? `${sub.billing_period}${sub.billing_interval && sub.billing_interval > 1 ? ` · every ${sub.billing_interval}` : ""}` : "—" },
    { key: "start_date", header: "Start date", render: (sub) => sub.start_date ? formatDate(sub.start_date) : "—" },
    { key: "next_billing_date", header: "Next billing", render: (sub) => sub.next_billing_date ? formatDate(sub.next_billing_date) : "—" },
    { key: "total", header: "Total", align: "right", render: (sub) => <span className="font-semibold">{formatCurrency(Number(sub.total))}</span> },
    { key: "status", header: "Status", render: (sub) => <StatusBadge status={sub.status} /> },
  ];
  return <div className="space-y-5">
    <PageHeader title="Subscriptions" description="Track customer subscriptions, billing schedules and lifecycle status." actions={<Button onClick={() => navigate("/subscriptions/new")}><Plus className="size-4" aria-hidden /> New subscription</Button>} />
    <Tabs aria-label="Filter subscriptions by status" value={status} onChange={(value) => list.setFilter("status", value === "all" ? undefined : value)} tabs={STATUSES} />
    {!USE_MOCKS && <p className="text-xs text-muted">The current backend list endpoint does not support search by subscription number; status and customer filters are available.</p>}
    <DataTable columns={columns} data={subscriptions.data} isLoading={subscriptions.isPending} isFetching={subscriptions.isFetching} isError={subscriptions.isError} errorMessage={subscriptions.error instanceof Error ? subscriptions.error.message : "Could not load subscriptions."} onRetry={() => void subscriptions.refetch()} list={list} rowKey={(sub) => sub.id} onRowClick={(sub) => navigate(`/subscriptions/${sub.id}`)} searchPlaceholder={USE_MOCKS ? "Search number or customer…" : false} filters={<Select aria-label="Filter by customer" className="w-56" options={(customers.data ?? []).map((customer) => ({ value: customer.id, label: customer.name }))} placeholder="All customers" value={String(query.customer_id ?? "")} onChange={(event) => list.setFilter("customer_id", event.target.value || undefined)} />} empty={{ icon: <Repeat />, title: "No subscriptions yet", description: "Create a subscription to start tracking a customer’s recurring service.", action: <Button size="sm" onClick={() => navigate("/subscriptions/new")}><Plus /> New subscription</Button> }} rowActions={(sub) => [
      { label: "View details", icon: <Eye className="size-4" />, onSelect: () => navigate(`/subscriptions/${sub.id}`) },
      ...(["draft", "quotation"].includes(sub.status) ? [{ label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => navigate(`/subscriptions/${sub.id}/edit`) }] : []),
    ]} />
    {customers.isError && <p role="status" className="text-xs text-warning">Customer names and filtering could not be loaded. <button className="underline" onClick={() => void customers.refetch()}>Retry</button></p>}
    {plans.isError && <p role="status" className="text-xs text-warning">Plan names could not be loaded; plan IDs are shown instead. <button className="underline" onClick={() => void plans.refetch()}>Retry</button></p>}
  </div>;
}
