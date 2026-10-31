import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CopyPlus, Eye, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { QuotationTemplateFormDialog } from "@/components/quotationTemplates/QuotationTemplateFormDialog";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import { useIsAdmin } from "@/context/AuthContext";
import { useListQuery } from "@/hooks/useListQuery";
import { useToast } from "@/components/ui/Toast";
import { USE_MOCKS } from "@/services/api";
import { planService } from "@/services/planService";
import { productService } from "@/services/productService";
import { quotationTemplateService } from "@/services/quotationTemplateService";
import type { QuotationTemplate, QuotationTemplateInput, QuotationTemplateListQuery } from "@/types/quotationTemplate";

function templatePayload(template: QuotationTemplate, status: string): QuotationTemplateInput {
  return {
    name: template.name, description: template.description ?? null, payment_terms: template.payment_terms ?? null,
    validity_days: template.validity_days, status,
    lines: template.lines.map((line) => ({ product_id: line.product_id, plan_id: line.plan_id ?? null, quantity: Number(line.quantity), unit_price: Number(line.unit_price) })),
  };
}

export default function QuotationTemplates() {
  const navigate = useNavigate();
  const admin = useIsAdmin();
  const client = useQueryClient();
  const toast = useToast();
  const list = useListQuery({ sortBy: "name" });
  const query = list.query as QuotationTemplateListQuery;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationTemplate | null>(null);
  const [target, setTarget] = useState<{ template: QuotationTemplate; action: "status" | "delete" } | null>(null);
  const templates = useQuery({ queryKey: ["quotation-templates", "list", query], queryFn: () => quotationTemplateService.list(query) });
  const products = useQuery({ queryKey: ["products", "quotation-template-names"], queryFn: () => productService.list({ page: 1, page_size: 100 }) });
  const plans = useQuery({ queryKey: ["plans", "quotation-template-names"], queryFn: () => planService.list({ page: 1, page_size: 100 }) });
  const productNames = new Map((products.data?.items ?? []).map((product) => [String(product.id), product.name]));
  const planNames = new Map((plans.data?.items ?? []).map((plan) => [String(plan.id), plan.name]));
  const mutation = useMutation({
    mutationFn: async ({ template, action }: { template: QuotationTemplate; action: "status" | "delete" }) => {
      if (action === "delete") return quotationTemplateService.remove(template.id);
      const status = template.status === "active" ? "inactive" : "active";
      return quotationTemplateService.update(template.id, templatePayload(template, status));
    },
    onSuccess: (_, { template, action }) => {
      void client.invalidateQueries({ queryKey: ["quotation-templates"] });
      void client.invalidateQueries({ queryKey: ["quotation-template", template.id] });
      toast.success(action === "delete" ? "Quotation template deleted." : template.status === "active" ? "Quotation template deactivated." : "Quotation template activated.");
      setTarget(null);
    },
    onError: (error: Error) => { toast.error(error.message || "The quotation template action failed."); setTarget(null); },
  });
  const columns: Column<QuotationTemplate>[] = [
    { key: "name", header: "Template", sortable: true, render: (template) => <div className="min-w-40"><p className="font-semibold text-ink">{template.name}</p><p className="mt-0.5 max-w-64 truncate text-xs text-muted">{template.description || "No description"}</p></div> },
    { key: "lines", header: "Products / plans", render: (template) => <div className="max-w-64 truncate" title={template.lines.map((line) => `${productNames.get(line.product_id) ?? `Product ${line.product_id}`}${line.plan_id ? ` · ${planNames.get(line.plan_id) ?? `Plan ${line.plan_id}`}` : ""}`).join(", ")}>{template.lines.length ? template.lines.map((line) => `${productNames.get(line.product_id) ?? `Product ${line.product_id}`}${line.plan_id ? ` · ${planNames.get(line.plan_id) ?? `Plan ${line.plan_id}`}` : ""}`).join(", ") : "No product lines"}</div> },
    { key: "line_count", header: "Lines", align: "right", render: (template) => template.lines.length },
    { key: "validity_days", header: "Validity", render: (template) => `${template.validity_days} days` },
    { key: "status", header: "Status", render: (template) => <StatusBadge status={template.status} /> },
  ];
  const actions = (template: QuotationTemplate) => [
    { label: "View details", icon: <Eye />, onSelect: () => navigate(`/quotation-templates/${template.id}`) },
    { label: "Use template", icon: <CopyPlus />, onSelect: () => navigate(`/subscriptions/new?template=${encodeURIComponent(template.id)}`), disabled: template.status !== "active" || template.lines.length === 0 },
    { label: "Edit", icon: <Pencil />, onSelect: () => setEditing(template) },
    { label: template.status === "active" ? "Deactivate" : "Activate", icon: template.status === "active" ? <Archive /> : <RotateCcw />, onSelect: () => setTarget({ template, action: "status" }) },
    ...(admin ? [{ label: "Delete", icon: <Trash2 />, tone: "danger" as const, onSelect: () => setTarget({ template, action: "delete" }) }] : []),
  ];
  const statusFilter = <Select aria-label="Filter by status" className="w-40" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} placeholder="All statuses" value={String(query.status ?? "")} onChange={(event) => list.setFilter("status", event.target.value || undefined)} />;
  return <div className="space-y-5">
    <PageHeader title="Quotation templates" description="Reuse product offers, payment terms and quotation validity defaults." actions={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-4" /> New template</Button>} />
    {!USE_MOCKS && <p className="text-xs text-muted">The current API supports name search and pagination. Status filtering is available in mock mode only.</p>}
    <DataTable columns={columns} data={templates.data} isLoading={templates.isPending} isFetching={templates.isFetching} isError={templates.isError} errorMessage={templates.error instanceof Error ? templates.error.message : "Could not load quotation templates."} onRetry={() => void templates.refetch()} list={list} rowKey={(template) => template.id} onRowClick={(template) => navigate(`/quotation-templates/${template.id}`)} filters={USE_MOCKS ? statusFilter : undefined} searchPlaceholder="Search template names…" empty={{ icon: <CopyPlus />, title: "No quotation templates yet", description: "Create a reusable offer to start a quotation faster.", action: <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-4" /> New template</Button> }} rowActions={actions} />
    {(products.isError || plans.isError) && <p role="status" className="text-xs text-warning">Product or plan names could not be loaded; IDs are shown instead. <button className="underline" onClick={() => { void products.refetch(); void plans.refetch(); }}>Retry</button></p>}
    <QuotationTemplateFormDialog open={formOpen || Boolean(editing)} template={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
    <ConfirmDialog open={Boolean(target)} onClose={() => setTarget(null)} onConfirm={() => target && mutation.mutate(target)} loading={mutation.isPending} tone={target?.action === "delete" || target?.template.status === "active" ? "danger" : "primary"} title={target?.action === "delete" ? `Delete ${target.template.name}?` : `${target?.template.status === "active" ? "Deactivate" : "Activate"} ${target?.template.name}?`} description={target?.action === "delete" ? "Templates already used by subscriptions cannot be deleted. The backend will preserve those templates." : target?.template.status === "active" ? "This template will no longer be available when creating a subscription." : "This template will be available when creating a subscription again."} confirmLabel={target?.action === "delete" ? "Delete template" : target?.template.status === "active" ? "Deactivate" : "Activate"} />
  </div>;
}
