import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Layers3, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { VariantFormDialog } from "@/components/products/VariantFormDialog";
import { useIsAdmin } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { productService } from "@/services/productService";
import type { Product, ProductVariant, ProductVariantCreate, ProductVariantUpdate } from "@/types/product";

const TYPE_LABELS: Record<string, string> = { software: "Software", service: "Service", add_on: "Add-on", physical: "Physical" };

export default function ProductDetail() {
  const { id = "" } = useParams();
  const admin = useIsAdmin();
  const client = useQueryClient();
  const toast = useToast();
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [variantFormOpen, setVariantFormOpen] = useState(false);
  const [variantEditing, setVariantEditing] = useState<ProductVariant | null>(null);
  const [variantDeleting, setVariantDeleting] = useState<ProductVariant | null>(null);
  const productQuery = useQuery({ queryKey: ["product", id], queryFn: () => productService.getById(id) });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["product", id] });
    void client.invalidateQueries({ queryKey: ["products"] });
  };
  const createVariant = useMutation({
    mutationFn: (data: ProductVariantCreate) => productService.createVariant(id, data),
    onSuccess: () => { refresh(); setVariantFormOpen(false); toast.success("Variant added."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateVariant = useMutation({
    mutationFn: ({ variantId, data }: { variantId: string | number; data: ProductVariantUpdate }) => productService.updateVariant(variantId, data),
    onSuccess: () => { refresh(); setVariantFormOpen(false); setVariantEditing(null); toast.success("Variant updated."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteVariant = useMutation({
    mutationFn: (variant: ProductVariant) => productService.removeVariant(variant.id),
    onSuccess: () => { refresh(); setVariantDeleting(null); toast.success("Variant removed."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const archiveProduct = useMutation({
    mutationFn: (product: Product) => productService.update(product.id, { status: product.status === "active" ? "archived" : "active" }),
    onSuccess: (saved) => { refresh(); toast.success(saved.status === "active" ? "Product restored." : "Product archived."); },
    onError: (error: Error) => toast.error(error.message),
  });
  if (productQuery.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-56 w-full" /><Skeleton className="h-72 w-full" /></div>;
  if (productQuery.isError || !productQuery.data) return <><PageHeader title="Product" back={{ to: "/products", label: "Products" }} /><ErrorState message={productQuery.error instanceof Error ? productQuery.error.message : "Could not load this product."} onRetry={() => void productQuery.refetch()} /></>;
  const product = productQuery.data;
  const variants = product.attributes.flatMap((attribute) => attribute.values.map((variant) => ({ ...variant, attribute_name: attribute.name, attribute_id: attribute.id })));
  return <div className="space-y-6">
    <PageHeader title={product.name} description="Product details, pricing and available variants." back={{ to: "/products", label: "Products" }} actions={admin && <><Button variant="secondary" onClick={() => setProductFormOpen(true)}><Pencil className="size-4" aria-hidden /> Edit</Button><Button variant="secondary" onClick={() => archiveProduct.mutate(product)} loading={archiveProduct.isPending}>{product.status === "active" ? <><Archive className="size-4" aria-hidden /> Archive</> : <><RotateCcw className="size-4" aria-hidden /> Restore</>}</Button></>} />
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={product.status} /><span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">{TYPE_LABELS[product.product_type] ?? product.product_type}</span></div><p className="mt-4 max-w-3xl text-sm leading-6 text-muted">{product.description || "No description has been added."}</p></div></div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Sales price" value={formatCurrency(product.sales_price)} prominent />
        <Info label="Cost price" value={product.cost_price == null ? "—" : formatCurrency(product.cost_price)} />
        <Info label="Created" value={product.created_at ? formatDate(product.created_at) : "—"} />
        <Info label="Plans using product" value={product.plans_count == null ? "Not available" : String(product.plans_count)} />
      </div>
    </section>
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Variants</h2><p className="mt-1 text-sm text-muted">Attribute values and their backend supplied extra prices.</p></div>{admin && <Button onClick={() => { setVariantEditing(null); setVariantFormOpen(true); }}><Plus className="size-4" aria-hidden /> Add variant</Button>}</div>
      {!variants.length ? <EmptyState icon={<Layers3 />} title="No variants yet" description={admin ? "Add an attribute value, such as a brand or edition." : "This product has no configured variants."} action={admin && <Button size="sm" onClick={() => { setVariantEditing(null); setVariantFormOpen(true); }}><Plus aria-hidden /> Add variant</Button>} /> : <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[540px] text-left"><thead className="bg-surface-2/40 text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Attribute</th><th className="px-4 py-3">Value</th><th className="px-4 py-3 text-right">Extra price</th>{admin && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody>{variants.map((variant) => <tr key={variant.id} className="border-t border-line/60"><td className="px-4 py-3 text-muted">{variant.attribute_name}</td><td className="px-4 py-3 font-medium">{variant.value}</td><td className="px-4 py-3 text-right">{formatCurrency(variant.extra_price)}</td>{admin && <td className="px-4 py-3 text-right"><div className="inline-flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setVariantEditing(variant); setVariantFormOpen(true); }} aria-label={`Edit ${variant.value}`}><Pencil className="size-4" aria-hidden /></Button><Button variant="ghost" size="sm" onClick={() => setVariantDeleting(variant)} aria-label={`Remove ${variant.value}`}><Trash2 className="size-4 text-danger" aria-hidden /></Button></div></td>}</tr>)}</tbody></table></div>}
    </section>
    <ProductFormDialog open={admin && productFormOpen} product={product} onClose={() => setProductFormOpen(false)} />
    {admin && <><VariantFormDialog open={variantFormOpen} variant={variantEditing} onClose={() => { setVariantFormOpen(false); setVariantEditing(null); }} loading={createVariant.isPending || updateVariant.isPending} onSave={(data) => { if (variantEditing) updateVariant.mutate({ variantId: variantEditing.id, data }); else createVariant.mutate(data as ProductVariantCreate); }} /><ConfirmDialog open={Boolean(variantDeleting)} onClose={() => setVariantDeleting(null)} onConfirm={() => variantDeleting && deleteVariant.mutate(variantDeleting)} loading={deleteVariant.isPending} tone="danger" title={`Remove ${variantDeleting?.value ?? "variant"}?`} description="This value will no longer be available for new subscriptions." confirmLabel="Remove variant" /></>}
  </div>;
}

function Info({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return <div className="rounded-xl border border-line bg-surface-2/30 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p><p className={`mt-2 ${prominent ? "text-xl font-bold text-primary" : "text-sm font-semibold text-ink"}`}>{value}</p></div>;
}
