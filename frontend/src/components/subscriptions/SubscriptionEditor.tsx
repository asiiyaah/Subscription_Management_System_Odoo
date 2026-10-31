import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, Skeleton } from "@/components/common/States";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { planService } from "@/services/planService";
import { quotationTemplateService } from "@/services/quotationTemplateService";
import { subscriptionService } from "@/services/subscriptionService";
import type { Plan } from "@/types/plan";
import type { QuotationTemplate } from "@/types/quotationTemplate";
import type { SubscriptionCreate, SubscriptionLineInput, SubscriptionProductDetail, SubscriptionUpdate } from "@/types/subscription";

interface DraftLine { key: number; product_id: string; plan_id: string; variant_id: string; quantity: string }
interface EditorValues { customer_id: string; lines: DraftLine[]; start_date: string; end_date: string; status: "draft" | "quotation"; discount_id: string; template_id: string; quotation_valid_until: string; notes: string }
const today = () => new Date().toISOString().slice(0, 10);
let nextLineKey = 1;
const newLine = (): DraftLine => ({ key: nextLineKey++, product_id: "", plan_id: "", variant_id: "", quantity: "1" });
const EMPTY: EditorValues = { customer_id: "", lines: [newLine()], start_date: "", end_date: "", status: "draft", discount_id: "", template_id: "", quotation_valid_until: "", notes: "" };
const STATUS_OPTIONS = [{ value: "draft", label: "Draft" }, { value: "quotation", label: "Quotation" }];

function LineEditor({ line, index, products, onChange, onRemove, canRemove }: { line: DraftLine; index: number; products: SubscriptionProductDetail[]; onChange: (changes: Partial<DraftLine>) => void; onRemove: () => void; canRemove: boolean }) {
  const selectedProduct = products.find((product) => product.id === line.product_id);
  const productDetail = useQuery({ queryKey: ["subscription-product", line.product_id], queryFn: () => subscriptionService.product(line.product_id), enabled: Boolean(line.product_id) });
  const plans = useQuery({ queryKey: ["plans", "subscription-picker", line.product_id], queryFn: () => planService.list({ page: 1, page_size: 100, product_id: line.product_id, status: "active" }), enabled: Boolean(line.product_id) });
  const availablePlans = plans.data?.items ?? [];
  const variants = productDetail.data?.attributes.flatMap((attribute) => attribute.values.map((value) => ({ value: value.id, label: `${attribute.name}: ${value.value}` }))) ?? [];
  return <div className="grid gap-3 rounded-xl border border-line bg-surface-2/30 p-4 md:grid-cols-[minmax(160px,1.3fr)_minmax(150px,1.2fr)_minmax(150px,1.2fr)_110px_40px] md:items-end">
    <Select label={`Product ${index + 1}`} options={products.map((product) => ({ value: product.id, label: product.name }))} value={line.product_id} placeholder="Choose a product" onChange={(event) => onChange({ product_id: event.target.value, plan_id: "", variant_id: "" })} />
    <Select label="Plan (optional)" options={availablePlans.map((plan: Plan) => ({ value: String(plan.id), label: `${plan.name} · min ${plan.minimum_quantity}` }))} value={line.plan_id} placeholder={plans.isPending ? "Loading plans…" : "No plan"} onChange={(event) => onChange({ plan_id: event.target.value })} disabled={!line.product_id || plans.isError} />
    <Select label="Variant (optional)" options={variants} value={line.variant_id} placeholder={productDetail.isPending ? "Loading variants…" : variants.length ? "No variant" : "No variants"} onChange={(event) => onChange({ variant_id: event.target.value })} disabled={!line.product_id || productDetail.isError || !variants.length} />
    <TextField label="Quantity" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => onChange({ quantity: event.target.value })} />
    <Button className="mb-0.5" variant="ghost" size="sm" aria-label={`Remove product line ${index + 1}`} disabled={!canRemove} onClick={onRemove}><Trash2 className="size-4 text-danger" /></Button>
    {plans.isError && <p className="text-xs text-danger md:col-span-5">Could not load plans for this product. <button type="button" className="underline" onClick={() => void plans.refetch()}>Retry</button></p>}
    {productDetail.isError && <p className="text-xs text-danger md:col-span-5">Could not load variants. <button type="button" className="underline" onClick={() => void productDetail.refetch()}>Retry</button></p>}
    {line.plan_id && availablePlans.find((plan) => String(plan.id) === line.plan_id) && Number(line.quantity) < Number(availablePlans.find((plan) => String(plan.id) === line.plan_id)!.minimum_quantity) && <p className="text-xs text-danger md:col-span-5">This plan requires a minimum quantity of {availablePlans.find((plan) => String(plan.id) === line.plan_id)!.minimum_quantity}.</p>}
    {line.plan_id && availablePlans.find((plan) => String(plan.id) === line.plan_id) && (() => { const plan = availablePlans.find((item) => String(item.id) === line.plan_id)!; return (plan.start_date && plan.start_date > today()) || (plan.end_date && plan.end_date < today()) ? <p className="text-xs text-danger md:col-span-5">This plan is outside its availability dates.</p> : null; })()}
    {selectedProduct?.status !== "active" && selectedProduct && <p className="text-xs text-danger md:col-span-5">This product is not active.</p>}
  </div>;
}

function addValidityDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function SubscriptionEditor() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const editing = Boolean(id);
  const subscriptionQuery = useQuery({ queryKey: ["subscription", id], queryFn: () => subscriptionService.get(id), enabled: editing });
  const [values, setValues] = useState<EditorValues>(EMPTY);
  const [lineErrors, setLineErrors] = useState<string[]>([]);
  const customers = useQuery({ queryKey: ["subscription-customers"], queryFn: () => subscriptionService.customers() });
  const products = useQuery({ queryKey: ["subscription-products"], queryFn: () => subscriptionService.products() });
  const discounts = useQuery({ queryKey: ["subscription-discounts"], queryFn: () => subscriptionService.discounts() });
  const templates = useQuery({ queryKey: ["quotation-templates", "subscription-picker"], queryFn: async () => (await quotationTemplateService.list({ page: 1, page_size: 100 })).items.filter((template) => template.status === "active") });
  useEffect(() => {
    if (!editing && customers.data && (searchParams.get("customer_id") || searchParams.get("template"))) {
      setValues((current) => ({ ...current, customer_id: searchParams.get("customer_id") ?? current.customer_id }));
    }
  }, [customers.data, editing, searchParams]);
  useEffect(() => {
    if (editing && subscriptionQuery.data) {
      const sub = subscriptionQuery.data;
      setValues({ customer_id: sub.customer_id, lines: sub.lines.map((line) => ({ key: nextLineKey++, product_id: line.product_id, plan_id: line.plan_id ?? "", variant_id: line.product_attribute_value_id ?? "", quantity: String(line.quantity) })), start_date: sub.start_date ?? "", end_date: sub.end_date ?? "", status: sub.status === "quotation" ? "quotation" : "draft", discount_id: "", template_id: sub.quotation_template_id ?? "", quotation_valid_until: sub.quotation_valid_until ?? "", notes: sub.notes ?? "" });
    }
  }, [editing, subscriptionQuery.data]);

  const templateFromUrl = searchParams.get("template");
  useEffect(() => {
    if (editing || !templateFromUrl || !templates.data) return;
    const template = templates.data.find((item) => item.id === templateFromUrl);
    if (template) applyTemplate(template);
  // Apply once per URL template and loaded template list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, templateFromUrl, templates.data]);

  function set(field: keyof EditorValues, value: string) { setValues((current) => ({ ...current, [field]: value })); }
  function changeLine(key: number, changes: Partial<DraftLine>) { setValues((current) => ({ ...current, lines: current.lines.map((line) => line.key === key ? { ...line, ...changes } : line) })); }
  function applyTemplate(template: QuotationTemplate) {
    setValues((current) => ({ ...current, template_id: template.id, quotation_valid_until: addValidityDays(template.validity_days), notes: template.payment_terms ?? "", lines: template.lines.length ? template.lines.map((line) => ({ key: nextLineKey++, product_id: line.product_id, plan_id: line.plan_id ?? "", variant_id: "", quantity: String(line.quantity ?? 1) })) : [newLine()] }));
  }
  const linePayload: SubscriptionLineInput[] = values.lines.filter((line) => line.product_id).map((line) => ({ product_id: line.product_id, plan_id: line.plan_id || undefined, product_attribute_value_id: line.variant_id || undefined, quantity: Number(line.quantity) }));
  const currentPayload = useMemo<SubscriptionCreate | null>(() => {
    if (!values.customer_id || linePayload.length !== values.lines.length || linePayload.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) return null;
    return { customer_id: values.customer_id, lines: linePayload, notes: values.notes.trim() || undefined, start_date: values.start_date || undefined, end_date: values.end_date || undefined, discount_id: values.discount_id || undefined, quotation_template_id: values.template_id || undefined, quotation_valid_until: values.quotation_valid_until || undefined, status: values.status };
  // Form values determine a backend-shaped request; no billing fields or totals are sent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);
  const payloadKey = currentPayload ? JSON.stringify(currentPayload) : "";
  const [debouncedKey, setDebouncedKey] = useState("");
  useEffect(() => {
    if (!payloadKey) { setDebouncedKey(""); return; }
    const timer = setTimeout(() => setDebouncedKey(payloadKey), 350);
    return () => clearTimeout(timer);
  }, [payloadKey]);
  const previewPayload = debouncedKey ? JSON.parse(debouncedKey) as SubscriptionCreate : null;
  const preview = useQuery({ queryKey: ["subscription-preview", debouncedKey], queryFn: () => subscriptionService.preview(previewPayload!), enabled: !editing && Boolean(previewPayload) });
  const previewIsCurrent = Boolean(payloadKey && payloadKey === debouncedKey);
  const createMutation = useMutation({
    mutationFn: (data: SubscriptionCreate) => subscriptionService.create(data),
    onSuccess: (created) => { void client.invalidateQueries({ queryKey: ["subscriptions"] }); toast.success("Subscription created."); navigate(`/subscriptions/${created.id}`); },
    onError: (error: Error) => toast.error(error.message || "Could not create subscription."),
  });
  const updateMutation = useMutation({
    mutationFn: (data: SubscriptionUpdate) => subscriptionService.update(id, data),
    onSuccess: (updated) => { void client.invalidateQueries({ queryKey: ["subscriptions"] }); void client.invalidateQueries({ queryKey: ["subscription", id] }); toast.success("Subscription updated."); navigate(`/subscriptions/${updated.id}`); },
    onError: (error: Error) => toast.error(error.message || "Could not update subscription."),
  });

  if (editing && subscriptionQuery.isPending) return <div className="space-y-5"><Skeleton className="h-10 w-64" /><Skeleton className="h-80 rounded-2xl" /></div>;
  if (editing && subscriptionQuery.isError) return <ErrorState message={subscriptionQuery.error instanceof Error ? subscriptionQuery.error.message : "Could not load subscription."} onRetry={() => void subscriptionQuery.refetch()} />;
  const subscription = subscriptionQuery.data;
  const editable = !editing || (subscription && ["draft", "quotation"].includes(subscription.status));
  if (editing && subscription && !editable) return <div className="space-y-4"><Alert tone="info">Only draft and quotation subscriptions can be edited.</Alert><Button variant="secondary" onClick={() => navigate(`/subscriptions/${id}`)}><ArrowLeft className="size-4" /> Back to subscription</Button></div>;
  const productItems = products.data?.items ?? [];
  const formDisabled = createMutation.isPending || updateMutation.isPending || (!editing && (!customers.data || !productItems.length));
  const validLines = values.lines.length > 0 && values.lines.every((line) => line.product_id && Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (editing) {
      if (values.start_date && values.end_date && values.end_date < values.start_date) { setLineErrors(["End date must be on or after start date."]); return; }
      const patch: SubscriptionUpdate = {};
      const nextNotes = values.notes || null;
      const nextStartDate = values.start_date || null;
      const nextEndDate = values.end_date || null;
      if (nextNotes !== (subscription?.notes ?? null)) patch.notes = nextNotes;
      if (nextStartDate !== (subscription?.start_date ?? null)) patch.start_date = nextStartDate;
      if (nextEndDate !== (subscription?.end_date ?? null)) patch.end_date = nextEndDate;
      if (Object.keys(patch).length) updateMutation.mutate(patch);
      else navigate(`/subscriptions/${id}`);
      return;
    }
    const errors = values.lines.flatMap((line, index) => !line.product_id ? [`Choose a product for line ${index + 1}.`] : !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 ? [`Quantity on line ${index + 1} must be greater than zero.`] : []);
    if (!values.customer_id) errors.push("Choose a customer.");
    if (values.start_date && values.end_date && values.end_date < values.start_date) errors.push("End date must be on or after start date.");
    setLineErrors(errors);
    if (errors.length || !currentPayload || !previewIsCurrent || preview.isPending || preview.isError || !preview.data) return;
    createMutation.mutate(currentPayload);
  }
  return <div className="space-y-6">
    <PageHeader back={{ to: editing ? `/subscriptions/${id}` : "/subscriptions", label: editing ? "Back to subscription" : "Back to Subscriptions" }} title={editing ? `Edit ${subscription?.subscription_number ?? "subscription"}` : "New subscription"} description={editing ? "Only the dates and notes can be changed in this status." : "Choose a customer and products. The pricing preview comes from the backend."} />
    {customers.isError && <ErrorState message="Could not load customers." onRetry={() => void customers.refetch()} />}
    {products.isError && <ErrorState message="Could not load active products." onRetry={() => void products.refetch()} />}
    {!editing && templates.isError && <Alert tone="info">Quotation templates could not be loaded. You can continue without a template. <button className="underline" onClick={() => void templates.refetch()}>Retry</button></Alert>}
    {!editing && discounts.isError && <Alert tone="info">Discounts could not be loaded. You can continue without a discount. <button className="underline" onClick={() => void discounts.refetch()}>Retry</button></Alert>}
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">Subscription details</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!editing && <Select label="Customer" options={(customers.data ?? []).map((customer) => ({ value: customer.id, label: `${customer.name}${customer.company ? ` · ${customer.company}` : ""}` }))} value={values.customer_id} onChange={(event) => set("customer_id", event.target.value)} placeholder={customers.isPending ? "Loading customers…" : "Choose a customer"} />}
          {!editing && <Select label="Quotation template (optional)" options={(templates.data ?? []).map((template) => ({ value: template.id, label: template.name }))} value={values.template_id} onChange={(event) => { const template = templates.data?.find((item) => item.id === event.target.value); if (template) applyTemplate(template); else set("template_id", ""); }} placeholder="Start without a template" />}
          <Select label="Initial status" options={STATUS_OPTIONS} value={values.status} onChange={(event) => set("status", event.target.value)} disabled={editing} />
          <TextField label="Start date" type="date" value={values.start_date} onChange={(event) => set("start_date", event.target.value)} />
          <TextField label="End date (optional)" type="date" value={values.end_date} onChange={(event) => set("end_date", event.target.value)} />
          {!editing && values.status === "quotation" && <TextField label="Quotation valid until (optional)" type="date" value={values.quotation_valid_until} onChange={(event) => set("quotation_valid_until", event.target.value)} />}
          {!editing && <Select label="Discount (optional)" options={(discounts.data ?? []).map((discount) => ({ value: discount.id, label: `${discount.code ? `${discount.code} · ` : ""}${discount.name}` }))} value={values.discount_id} onChange={(event) => set("discount_id", event.target.value)} placeholder="No discount" />}
        </div>
        <div className="mt-4"><Textarea label="Notes" rows={3} value={values.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Add internal or customer-facing notes…" /></div>
      </section>
      {!editing ? <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Product lines</h2><p className="mt-1 text-xs text-muted">Price, discounts and taxes are returned by the pricing preview.</p></div><Button type="button" variant="secondary" size="sm" onClick={() => setValues((current) => ({ ...current, lines: [...current.lines, newLine()] }))}><Plus className="size-4" /> Add line</Button></div>
        <div className="space-y-3">{values.lines.map((line, index) => <LineEditor key={line.key} line={line} index={index} products={productItems} canRemove={values.lines.length > 1} onRemove={() => setValues((current) => ({ ...current, lines: current.lines.filter((item) => item.key !== line.key) }))} onChange={(changes) => changeLine(line.key, changes)} />)}</div>
        {lineErrors.map((message) => <p key={message} className="mt-3 text-sm text-danger">{message}</p>)}
      </section> : <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Existing product lines</h2><div className="space-y-2">{(subscription?.lines ?? []).map((line, index) => <div key={line.id ?? index} className="flex flex-wrap justify-between gap-3 rounded-xl bg-surface-2/30 px-4 py-3 text-sm"><span>{line.description ?? line.product_id} {line.plan_id ? `· Plan ${line.plan_id}` : ""}</span><span>Qty {line.quantity} · {formatCurrency(Number(line.line_total))}</span></div>)}</div></section>}
      {!editing && <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">Backend pricing preview</h2>
        {!currentPayload ? <p className="text-sm text-muted">Choose a customer, product and valid quantity to preview pricing.</p> : !previewIsCurrent || preview.isPending ? <div className="space-y-3"><Skeleton className="h-5 w-48" /><Skeleton className="h-24" /></div> : preview.isError ? <ErrorState message={preview.error instanceof Error ? preview.error.message : "Could not preview pricing."} onRetry={() => void preview.refetch()} /> : preview.data && <div className="grid gap-5 lg:grid-cols-[1fr_280px]"><div className="space-y-2">{preview.data.lines.map((line, index) => <div key={index} className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2/30 px-4 py-3 text-sm sm:grid-cols-4"><span>Line {index + 1} · Qty {line.quantity}</span><span>Unit {formatCurrency(Number(line.unit_price))}</span><span>Discount {formatCurrency(Number(line.discount))}</span><span className="text-right font-semibold">{formatCurrency(Number(line.total))}</span></div>)}</div><dl className="space-y-2 rounded-xl bg-surface-2/40 p-4 text-sm"><div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatCurrency(Number(preview.data.subtotal))}</dd></div><div className="flex justify-between"><dt className="text-muted">Discount</dt><dd>−{formatCurrency(Number(preview.data.discount_total))}</dd></div><div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{formatCurrency(Number(preview.data.tax_total))}</dd></div><div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd>{formatCurrency(Number(preview.data.total))}</dd></div></dl></div>}
      </section>}
      <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="secondary" onClick={() => navigate(editing ? `/subscriptions/${id}` : "/subscriptions")}>Cancel</Button><Button type="submit" loading={createMutation.isPending || updateMutation.isPending} disabled={formDisabled || (!editing && (!validLines || !previewIsCurrent || preview.isPending || preview.isError || !preview.data))}>{editing ? "Save changes" : values.status === "quotation" ? "Create quotation" : "Save as draft"}</Button></div>
    </form>
  </div>;
}
