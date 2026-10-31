import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { ErrorState } from "@/components/common/States";
import { productService } from "@/services/productService";
import { planService } from "@/services/planService";
import { useToast } from "@/components/ui/Toast";
import type { Product } from "@/types/product";
import type { BillingPeriod, Plan, PlanCreate, PlanStatus } from "@/types/plan";

interface Form {
  product_id: string;
  name: string;
  description: string;
  billing_period: BillingPeriod;
  billing_interval: string;
  price: string;
  trial_days: string;
  minimum_quantity: string;
  start_date: string;
  end_date: string;
  status: PlanStatus;
  is_pausable: boolean;
  is_renewable: boolean;
  auto_close: boolean;
  allows_early_closure: boolean;
}
const EMPTY: Form = { product_id: "", name: "", description: "", billing_period: "monthly", billing_interval: "1", price: "", trial_days: "0", minimum_quantity: "1", start_date: "", end_date: "", status: "active", is_pausable: true, is_renewable: true, auto_close: false, allows_early_closure: true };
const PERIODS = [{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }];

function planForm(plan: Plan): Form {
  return { product_id: String(plan.product_id), name: plan.name, description: plan.description ?? "", billing_period: plan.billing_period, billing_interval: String(plan.billing_interval ?? 1), price: String(plan.price), trial_days: String(plan.trial_days ?? 0), minimum_quantity: String(plan.minimum_quantity), start_date: plan.start_date ?? "", end_date: plan.end_date ?? "", status: plan.status, is_pausable: plan.is_pausable ?? true, is_renewable: plan.is_renewable ?? true, auto_close: plan.auto_close, allows_early_closure: plan.allows_early_closure };
}

export function PlanFormDialog({ open, plan, onClose }: { open: boolean; plan?: Plan | null; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const products = useQuery({ queryKey: ["products", "plan-picker"], queryFn: () => productService.list({ page: 1, page_size: 50, status: "active", sort_by: "name", sort_dir: "asc" }), enabled: open });
  useEffect(() => {
    if (!open) return;
    setForm(plan ? planForm(plan) : EMPTY);
    setErrors({});
  }, [open, plan]);
  useEffect(() => {
    if (open && !plan && !form.product_id && products.data?.items[0]) setForm((current) => ({ ...current, product_id: String(products.data!.items[0].id) }));
  }, [open, plan, form.product_id, products.data]);
  const mutation = useMutation({
    mutationFn: (data: PlanCreate) => plan ? planService.update(plan.id, data) : planService.create(data),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["plans"] }); if (plan) void client.invalidateQueries({ queryKey: ["plan", plan.id] }); toast.success(plan ? "Plan updated." : "Plan created."); onClose(); },
    onError: (error: Error) => toast.error(error.message || "Could not save plan."),
  });
  const set = (key: keyof Form, value: string | boolean) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); };
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!form.product_id) next.product_id = "Choose a product.";
    if (!form.name.trim()) next.name = "Plan name is required.";
    if (!form.price.trim() || !Number.isFinite(Number(form.price)) || Number(form.price) < 0) next.price = "Enter a valid non-negative price.";
    if (!/^\d+$/.test(form.billing_interval) || Number(form.billing_interval) < 1) next.billing_interval = "Enter an interval of at least 1.";
    if (!/^\d+$/.test(form.trial_days) || Number(form.trial_days) < 0) next.trial_days = "Trial days must be zero or more.";
    if (!/^\d+$/.test(form.minimum_quantity) || Number(form.minimum_quantity) < 1) next.minimum_quantity = "Minimum quantity must be at least 1.";
    if (form.start_date && form.end_date && form.end_date < form.start_date) next.end_date = "End date must be on or after the start date.";
    if (Object.keys(next).length) { setErrors(next); return; }
    mutation.mutate({ product_id: form.product_id, name: form.name.trim(), description: form.description.trim() || undefined, billing_period: form.billing_period, billing_interval: Number(form.billing_interval), price: Number(form.price), trial_days: Number(form.trial_days), minimum_quantity: Number(form.minimum_quantity), start_date: form.start_date || undefined, end_date: form.end_date || undefined, status: form.status, is_pausable: form.is_pausable, is_renewable: form.is_renewable, auto_close: form.auto_close, allows_early_closure: form.allows_early_closure });
  }
  const productOptions = (products.data?.items ?? []).map((product: Product) => ({ value: String(product.id), label: product.name }));
  return <Dialog open={open} onClose={mutation.isPending ? () => {} : onClose} title={plan ? "Edit plan" : "New plan"} description="Choose a product, billing schedule and subscription options." size="lg" footer={<><Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button type="submit" form="plan-form" loading={mutation.isPending} disabled={products.isError || products.isPending}>{plan ? "Save changes" : "Create plan"}</Button></>}>
    {products.isError ? <ErrorState message={products.error instanceof Error ? products.error.message : "Could not load products."} onRetry={() => void products.refetch()} /> : products.data && productOptions.length === 0 ? <Alert tone="info">There are no active products yet. Add or restore a product before creating a plan.</Alert> : <form id="plan-form" onSubmit={submit} noValidate className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Select label="Product" options={productOptions} value={form.product_id} onChange={(event) => set("product_id", event.target.value)} error={errors.product_id} placeholder={products.isPending ? "Loading products…" : "Choose a product"} /><TextField label="Plan name" value={form.name} onChange={(event) => set("name", event.target.value)} error={errors.name} required placeholder="Pro Monthly" /></div>
      <Textarea label="Description" value={form.description} onChange={(event) => set("description", event.target.value)} rows={2} placeholder="Describe what's included in this plan." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><TextField label="Price (₹)" type="number" min="0" step="0.01" value={form.price} onChange={(event) => set("price", event.target.value)} error={errors.price} required /><Select label="Billing period" options={PERIODS} value={form.billing_period} onChange={(event) => set("billing_period", event.target.value)} /><TextField label="Every" type="number" min="1" step="1" value={form.billing_interval} onChange={(event) => set("billing_interval", event.target.value)} error={errors.billing_interval} hint={`billing ${form.billing_period === "daily" ? "day(s)" : form.billing_period === "weekly" ? "week(s)" : form.billing_period === "monthly" ? "month(s)" : "year(s)"}`} required /></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><TextField label="Minimum quantity" type="number" min="1" step="1" value={form.minimum_quantity} onChange={(event) => set("minimum_quantity", event.target.value)} error={errors.minimum_quantity} required /><TextField label="Trial days" type="number" min="0" step="1" value={form.trial_days} onChange={(event) => set("trial_days", event.target.value)} error={errors.trial_days} /><Select label="Status" options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} value={form.status} onChange={(event) => set("status", event.target.value)} /></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><TextField label="Available from" type="date" value={form.start_date} onChange={(event) => set("start_date", event.target.value)} /><TextField label="Available until" type="date" value={form.end_date} onChange={(event) => set("end_date", event.target.value)} error={errors.end_date} /></div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-xl border border-line bg-surface-2/20 p-4 sm:grid-cols-2"><Switch label="Auto-close at end" description="Close subscriptions automatically when this plan ends." checked={form.auto_close} onChange={(value) => set("auto_close", value)} /><Switch label="Can close early" description="Allow a customer or staff member to close before the end date." checked={form.allows_early_closure} onChange={(value) => set("allows_early_closure", value)} /><Switch label="Can be paused" checked={form.is_pausable} onChange={(value) => set("is_pausable", value)} /><Switch label="Can be renewed" checked={form.is_renewable} onChange={(value) => set("is_renewable", value)} /></div>
    </form>}
  </Dialog>;
}
