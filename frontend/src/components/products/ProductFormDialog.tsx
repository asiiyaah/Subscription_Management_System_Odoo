import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { productService } from "@/services/productService";
import { useToast } from "@/components/ui/Toast";
import type { Product, ProductCreate, ProductType } from "@/types/product";

type Form = { name: string; description: string; product_type: ProductType; sales_price: string; cost_price: string; status: "active" | "archived" };
const EMPTY: Form = { name: "", description: "", product_type: "software", sales_price: "", cost_price: "", status: "active" };
const TYPES = [{ value: "software", label: "Software" }, { value: "service", label: "Service" }, { value: "add_on", label: "Add-on" }, { value: "physical", label: "Physical" }];

export function ProductFormDialog({ open, product, onClose }: { open: boolean; product?: Product | null; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const editing = Boolean(product);
  useEffect(() => {
    if (open) setForm(product ? { name: product.name, description: product.description ?? "", product_type: product.product_type, sales_price: String(product.sales_price), cost_price: product.cost_price == null ? "" : String(product.cost_price), status: product.status } : EMPTY);
    setErrors({});
  }, [open, product]);
  const mutation = useMutation({
    mutationFn: (payload: ProductCreate) => product ? productService.update(product.id, payload) : productService.create(payload),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["products"] }); if (product) void client.invalidateQueries({ queryKey: ["product", product.id] }); toast.success(editing ? "Product updated." : "Product created."); onClose(); },
    onError: (error: Error) => toast.error(error.message || "Could not save product."),
  });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Product name is required.";
    if (form.sales_price === "" || !Number.isFinite(Number(form.sales_price)) || Number(form.sales_price) < 0) next.sales_price = "Enter a valid non-negative sales price.";
    if (form.cost_price !== "" && (!Number.isFinite(Number(form.cost_price)) || Number(form.cost_price) < 0)) next.cost_price = "Enter a valid non-negative cost price.";
    if (Object.keys(next).length) { setErrors(next); return; }
    mutation.mutate({ name: form.name.trim(), description: form.description.trim() || undefined, product_type: form.product_type, sales_price: Number(form.sales_price), cost_price: form.cost_price === "" ? undefined : Number(form.cost_price), status: form.status });
  }
  const set = (key: keyof Form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); };
  return <Dialog open={open} onClose={mutation.isPending ? () => {} : onClose} title={editing ? "Edit product" : "New product"} description="Set the product details and base prices." size="md" footer={<><Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button type="submit" form="product-form" loading={mutation.isPending}>{editing ? "Save changes" : "Create product"}</Button></>}>
    <form id="product-form" onSubmit={submit} noValidate className="space-y-4">
      <TextField label="Product name" value={form.name} onChange={(event) => set("name", event.target.value)} error={errors.name} required placeholder="SubscriptIQ Pro" />
      <Textarea label="Description / notes" value={form.description} onChange={(event) => set("description", event.target.value)} rows={3} placeholder="What does this product include?" />
      <Select label="Product type" value={form.product_type} options={TYPES} onChange={(event) => set("product_type", event.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Sales price (₹)" type="number" min="0" step="0.01" value={form.sales_price} onChange={(event) => set("sales_price", event.target.value)} error={errors.sales_price} required />
        <TextField label="Cost price (₹)" type="number" min="0" step="0.01" value={form.cost_price} onChange={(event) => set("cost_price", event.target.value)} error={errors.cost_price} />
      </div>
      <Select label="Status" value={form.status} options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} onChange={(event) => set("status", event.target.value)} />
    </form>
  </Dialog>;
}
