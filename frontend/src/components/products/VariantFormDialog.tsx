import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import type { ProductVariant, ProductVariantCreate } from "@/types/product";

export function VariantFormDialog({ open, variant, onClose, onSave, loading }: { open: boolean; variant?: ProductVariant | null; onClose: () => void; onSave: (data: ProductVariantCreate | { value: string; extra_price: number }) => void; loading: boolean }) {
  const [attributeName, setAttributeName] = useState("");
  const [value, setValue] = useState("");
  const [extraPrice, setExtraPrice] = useState("0");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setAttributeName(variant?.attribute_name ?? ""); setValue(variant?.value ?? ""); setExtraPrice(String(variant?.extra_price ?? 0)); setError(""); } }, [open, variant]);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) { setError("Enter a variant value."); return; }
    if (!variant && !attributeName.trim()) { setError("Enter an attribute name."); return; }
    if (extraPrice === "" || !Number.isFinite(Number(extraPrice)) || Number(extraPrice) < 0) { setError("Enter a valid non-negative extra price."); return; }
    onSave(variant ? { value: value.trim(), extra_price: Number(extraPrice) } : { attribute_name: attributeName.trim(), value: value.trim(), extra_price: Number(extraPrice) });
  }
  return <Dialog open={open} onClose={loading ? () => {} : onClose} title={variant ? "Edit variant" : "Add variant value"} description="Variant prices are stored by the product service." size="sm" footer={<><Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button><Button type="submit" form="variant-form" loading={loading}>{variant ? "Save changes" : "Add variant"}</Button></>}>
    <form id="variant-form" onSubmit={submit} noValidate className="space-y-4">
      {!variant && <TextField label="Attribute" placeholder="Brand" value={attributeName} onChange={(event) => setAttributeName(event.target.value)} />}
      <TextField label="Value" placeholder="Odoo" value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} error={error && !value.trim() ? error : undefined} required />
      <TextField label="Extra price (₹)" type="number" min="0" step="0.01" value={extraPrice} onChange={(event) => { setExtraPrice(event.target.value); setError(""); }} error={error && (extraPrice === "" || Number(extraPrice) < 0) ? error : undefined} required />
      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </form>
  </Dialog>;
}
