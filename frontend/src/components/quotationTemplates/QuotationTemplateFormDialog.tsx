import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { planService } from "@/services/planService";
import { productService } from "@/services/productService";
import { quotationTemplateService } from "@/services/quotationTemplateService";
import type { Product } from "@/types/product";
import type { Plan } from "@/types/plan";
import type { QuotationTemplate, QuotationTemplateInput } from "@/types/quotationTemplate";

interface DraftLine { key: number; product_id: string; plan_id: string; quantity: string; unit_price: string }
interface FormValues { name: string; description: string; payment_terms: string; validity_days: string; status: string; lines: DraftLine[] }
const emptyValues = (): FormValues => ({ name: "", description: "", payment_terms: "", validity_days: "30", status: "active", lines: [] });
let nextLineKey = 1;
const toValues = (template?: QuotationTemplate): FormValues => template ? ({
  name: template.name,
  description: template.description ?? "",
  payment_terms: template.payment_terms ?? "",
  validity_days: String(template.validity_days),
  status: template.status,
  lines: template.lines.map((line) => ({ key: nextLineKey++, product_id: line.product_id, plan_id: line.plan_id ?? "", quantity: String(line.quantity), unit_price: String(line.unit_price) })),
}) : emptyValues();

function TemplateLineEditor({ line, index, products, onChange, onRemove }: { line: DraftLine; index: number; products: Product[]; onChange: (changes: Partial<DraftLine>) => void; onRemove: () => void }) {
  const product = products.find((item) => String(item.id) === line.product_id);
  const plans = useQuery({ queryKey: ["plans", "quotation-template-picker", line.product_id], queryFn: () => planService.list({ page: 1, page_size: 100, product_id: line.product_id, status: "active" }), enabled: Boolean(line.product_id) });
  const availablePlans = plans.data?.items ?? [];
  return <div className="grid gap-3 rounded-xl border border-line bg-surface-2/30 p-4 md:grid-cols-[minmax(160px,1.4fr)_minmax(140px,1.2fr)_100px_130px_40px] md:items-end">
    <Select label={`Product ${index + 1}`} options={products.map((item) => ({ value: String(item.id), label: item.name }))} value={line.product_id} placeholder="Choose a product" onChange={(event) => onChange({ product_id: event.target.value, plan_id: "", unit_price: String(products.find((item) => String(item.id) === event.target.value)?.sales_price ?? "") })} />
    <Select label="Plan (optional)" options={availablePlans.map((plan: Plan) => ({ value: String(plan.id), label: plan.name }))} value={line.plan_id} placeholder={plans.isPending ? "Loading plans…" : "No plan"} onChange={(event) => { const selected = availablePlans.find((plan) => String(plan.id) === event.target.value); onChange({ plan_id: event.target.value, unit_price: String(selected?.price ?? product?.sales_price ?? "") }); }} disabled={!line.product_id || plans.isError} />
    <TextField label="Quantity" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => onChange({ quantity: event.target.value })} />
    <TextField label="Unit price" type="number" min="0" step="0.01" value={line.unit_price} readOnly hint={<span className="text-xs text-muted">From product or plan</span>} />
    <Button type="button" className="mb-0.5" variant="ghost" size="sm" aria-label={`Remove line ${index + 1}`} onClick={onRemove}><Trash2 className="size-4 text-danger" /></Button>
    {plans.isError && <p className="text-xs text-danger md:col-span-5">Could not load plans. <button type="button" className="underline" onClick={() => void plans.refetch()}>Retry</button></p>}
  </div>;
}

export function QuotationTemplateFormDialog({ open, template, onClose }: { open: boolean; template?: QuotationTemplate | null; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const products = useQuery({ queryKey: ["products", "quotation-template-picker"], queryFn: () => productService.list({ page: 1, page_size: 100, status: "active" }), enabled: open });
  const [values, setValues] = useState<FormValues>(() => toValues(template ?? undefined));
  const [formError, setFormError] = useState("");

  useEffect(() => { if (open) { setValues(toValues(template ?? undefined)); setFormError(""); } }, [open, template]);

  const save = useMutation({
    mutationFn: (input: QuotationTemplateInput) => template ? quotationTemplateService.update(template.id, input) : quotationTemplateService.create(input),
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: ["quotation-templates"] });
      void client.invalidateQueries({ queryKey: ["quotation-template", saved.id] });
      toast.success(template ? "Quotation template updated." : "Quotation template created.");
      onClose();
    },
    onError: (error: Error) => setFormError(error.message || "Could not save quotation template."),
  });

  function changeLine(key: number, changes: Partial<DraftLine>) { setValues((current) => ({ ...current, lines: current.lines.map((line) => line.key === key ? { ...line, ...changes } : line) })); }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    const name = values.name.trim();
    if (!name || name.length > 150) { setFormError("Enter a template name between 1 and 150 characters."); return; }
    const validity = Number(values.validity_days);
    if (!Number.isInteger(validity) || validity < 1 || validity > 365) { setFormError("Validity must be a whole number from 1 to 365 days."); return; }
    const errors = values.lines.flatMap((line, index) => !line.product_id ? [`Choose a product for line ${index + 1}.`] : !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 ? [`Quantity on line ${index + 1} must be greater than zero.`] : line.unit_price === "" || !Number.isFinite(Number(line.unit_price)) || Number(line.unit_price) < 0 ? [`Unit price on line ${index + 1} must be zero or greater.`] : []);
    if (errors.length) { setFormError(errors.join(" ")); return; }
    const input: QuotationTemplateInput = {
      name, description: values.description.trim() || null, payment_terms: values.payment_terms.trim() || null,
      validity_days: validity, status: values.status.trim() || "active",
      lines: values.lines.map((line) => ({ product_id: line.product_id, plan_id: line.plan_id || null, quantity: Number(line.quantity), unit_price: Number(line.unit_price) })),
    };
    save.mutate(input);
  }

  const productItems = products.data?.items ?? [];
  return <Dialog open={open} onClose={save.isPending ? () => {} : onClose} title={template ? `Edit ${template.name}` : "New quotation template"} description="Reusable quotation defaults and product lines." size="lg" footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button type="submit" form="quotation-template-form" loading={save.isPending} disabled={!products.data || products.isError}>{template ? "Save changes" : "Create template"}</Button></>}>
    <form id="quotation-template-form" onSubmit={submit} className="space-y-5">
      {formError && <Alert tone="error">{formError}</Alert>}
      {products.isError && <Alert tone="error">Could not load active products. <button type="button" className="underline" onClick={() => void products.refetch()}>Retry</button></Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Template name" required maxLength={150} value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} />
        <TextField label="Validity (days)" required type="number" min="1" max="365" step="1" value={values.validity_days} onChange={(event) => setValues((current) => ({ ...current, validity_days: event.target.value }))} />
        <TextField label="Payment terms" value={values.payment_terms} onChange={(event) => setValues((current) => ({ ...current, payment_terms: event.target.value }))} placeholder="e.g. Net 15" />
        <Select label="Status" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, ...(values.status !== "active" && values.status !== "inactive" ? [{ value: values.status, label: values.status }] : [])]} value={values.status} onChange={(event) => setValues((current) => ({ ...current, status: event.target.value }))} />
      </div>
      <Textarea label="Description" rows={3} value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} />
      <section className="space-y-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Product lines</h3><p className="text-xs text-muted">Unit price comes from the selected product or plan. Taxes and variants are not part of this API contract.</p></div><Button type="button" size="sm" variant="secondary" onClick={() => setValues((current) => ({ ...current, lines: [...current.lines, { key: nextLineKey++, product_id: "", plan_id: "", quantity: "1", unit_price: "" }] }))}><Plus className="size-4" /> Add line</Button></div>
        {products.isPending ? <p className="text-sm text-muted">Loading products…</p> : values.lines.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No product lines. Templates without lines can be saved, but cannot be used to create a subscription.</p> : <div className="space-y-3">{values.lines.map((line, index) => <TemplateLineEditor key={line.key} line={line} index={index} products={productItems} onChange={(changes) => changeLine(line.key, changes)} onRemove={() => setValues((current) => ({ ...current, lines: current.lines.filter((item) => item.key !== line.key) }))} />)}</div>}
      </section>
    </form>
  </Dialog>;
}
