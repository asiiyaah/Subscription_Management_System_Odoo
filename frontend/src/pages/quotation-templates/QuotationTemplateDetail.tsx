import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CopyPlus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, Skeleton } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { QuotationTemplateFormDialog } from "@/components/quotationTemplates/QuotationTemplateFormDialog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useIsAdmin } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { planService } from "@/services/planService";
import { productService } from "@/services/productService";
import { quotationTemplateService } from "@/services/quotationTemplateService";
import type { Plan } from "@/types/plan";
import type { ProductDetail } from "@/types/product";
import type { QuotationTemplate, QuotationTemplateInput } from "@/types/quotationTemplate";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-sm font-medium text-ink">{value}</p></div>;
}

function payload(template: QuotationTemplate, status: string): QuotationTemplateInput {
  return { name: template.name, description: template.description ?? null, payment_terms: template.payment_terms ?? null, validity_days: template.validity_days, status, lines: template.lines.map((line) => ({ product_id: line.product_id, plan_id: line.plan_id ?? null, quantity: Number(line.quantity), unit_price: Number(line.unit_price) })) };
}

export default function QuotationTemplateDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const admin = useIsAdmin();
  const client = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [confirming, setConfirming] = useState<"status" | "delete" | null>(null);
  const templateQuery = useQuery({ queryKey: ["quotation-template", id], queryFn: () => quotationTemplateService.get(id), enabled: Boolean(id) });
  const template = templateQuery.data;
  const productQueries = useQueries({ queries: (template?.lines ?? []).map((line) => ({ queryKey: ["product", line.product_id], queryFn: () => productService.getById(line.product_id) })) });
  const planQueries = useQueries({ queries: (template?.lines ?? []).filter((line) => line.plan_id).map((line) => ({ queryKey: ["plan", line.plan_id], queryFn: () => planService.getById(line.plan_id!) })) });
  const mutation = useMutation({
    mutationFn: async (action: "status" | "delete") => {
      if (!template) throw new Error("Quotation template is not loaded.");
      if (action === "delete") return quotationTemplateService.remove(template.id);
      return quotationTemplateService.update(template.id, payload(template, template.status === "active" ? "inactive" : "active"));
    },
    onSuccess: (_, action) => {
      void client.invalidateQueries({ queryKey: ["quotation-templates"] });
      void client.invalidateQueries({ queryKey: ["quotation-template", id] });
      if (action === "delete") { toast.success("Quotation template deleted."); navigate("/quotation-templates"); }
      else { toast.success(template?.status === "active" ? "Quotation template deactivated." : "Quotation template activated."); void templateQuery.refetch(); }
      setConfirming(null);
    },
    onError: (error: Error) => { toast.error(error.message || "The quotation template action failed."); setConfirming(null); },
  });
  if (templateQuery.isPending) return <div className="space-y-5"><Skeleton className="h-10 w-72" /><Skeleton className="h-52 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  if (templateQuery.isError || !template) return <ErrorState message={templateQuery.error instanceof Error ? templateQuery.error.message : "Could not load quotation template."} onRetry={() => void templateQuery.refetch()} />;
  const products = productQueries.map((query) => query.data).filter((product): product is ProductDetail => Boolean(product));
  const plans = planQueries.map((query) => query.data).filter((plan): plan is Plan => Boolean(plan));
  const hasRelatedError = productQueries.some((query) => query.isError) || planQueries.some((query) => query.isError);
  return <div className="space-y-6">
    <PageHeader back={{ to: "/quotation-templates", label: "Back to quotation templates" }} title={template.name} description={template.description || "Reusable quotation defaults."} actions={<div className="flex flex-wrap items-center gap-2"><StatusBadge status={template.status} /><Button variant="secondary" onClick={() => navigate(`/subscriptions/new?template=${encodeURIComponent(template.id)}`)} disabled={template.status !== "active" || template.lines.length === 0}><CopyPlus className="size-4" /> Use template</Button><Button variant="secondary" onClick={() => setFormOpen(true)}><Pencil className="size-4" /> Edit</Button><Button variant="secondary" onClick={() => setConfirming("status")}><Archive className="size-4" /> {template.status === "active" ? "Deactivate" : "Activate"}</Button>{admin && <Button variant="danger" onClick={() => setConfirming("delete")}><Trash2 className="size-4" /> Delete</Button>}</div>} />
    {hasRelatedError && <Alert tone="info">Some product or plan names could not be loaded; IDs are shown instead. <button className="underline" onClick={() => { void Promise.all([...productQueries.map((query) => query.refetch()), ...planQueries.map((query) => query.refetch())]); }}>Retry</button></Alert>}
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-4 font-semibold">Template details</h2><div className="grid gap-4 sm:grid-cols-2"><Info label="Validity" value={`${template.validity_days} days`} /><Info label="Status" value={<StatusBadge status={template.status} />} /><Info label="Payment terms" value={template.payment_terms || "—"} /><Info label="Product lines" value={template.lines.length} /></div></div>
      <div className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-3 font-semibold">Description</h2><p className="whitespace-pre-wrap text-sm text-muted">{template.description || "No description."}</p><h3 className="mb-2 mt-5 font-semibold">Quotation terms</h3><p className="whitespace-pre-wrap text-sm text-muted">{template.payment_terms || "No payment terms."}</p></div>
    </section>
    <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-4 font-semibold">Product lines</h2>{template.lines.length ? <div className="space-y-3">{template.lines.map((line, index) => {
      const product = products.find((item) => String(item.id) === line.product_id);
      const plan = plans.find((item) => String(item.id) === line.plan_id);
      return <article key={line.id ?? index} className="grid gap-3 rounded-xl border border-line bg-surface-2/25 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-semibold">{product ? <Link to={`/products/${product.id}`} className="text-primary hover:underline">{product.name}</Link> : `Product ${line.product_id}`}</p><p className="mt-0.5 text-xs text-muted">{plan ? <Link to={`/plans/${plan.id}`} className="hover:text-primary hover:underline">{plan.name}</Link> : line.plan_id ? `Plan ${line.plan_id}` : "No plan association"}</p></div><div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right"><span className="text-muted">Quantity</span><span>{line.quantity}</span><span className="text-muted">Unit price</span><span className="font-semibold">{formatCurrency(Number(line.unit_price))}</span></div></article>;
    })}</div> : <p className="text-sm text-muted">No product lines were added to this template.</p>}</section>
    <p className="text-xs text-muted">The backend response does not include created, updated, or last-used timestamps.</p>
    <QuotationTemplateFormDialog open={formOpen} template={template} onClose={() => setFormOpen(false)} />
    <ConfirmDialog open={Boolean(confirming)} onClose={() => setConfirming(null)} onConfirm={() => confirming && mutation.mutate(confirming)} loading={mutation.isPending} tone={confirming === "delete" || template.status === "active" ? "danger" : "primary"} title={confirming === "delete" ? `Delete ${template.name}?` : `${template.status === "active" ? "Deactivate" : "Activate"} ${template.name}?`} description={confirming === "delete" ? "A template referenced by a subscription cannot be deleted." : template.status === "active" ? "This template will no longer be available for new subscriptions." : "This template will be available when creating subscriptions again."} confirmLabel={confirming === "delete" ? "Delete template" : template.status === "active" ? "Deactivate" : "Activate"} />
  </div>;
}
