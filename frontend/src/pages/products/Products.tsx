import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Eye, Package, Pencil, Plus, RotateCcw } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { useListQuery } from "@/hooks/useListQuery";
import { useIsAdmin } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { productService } from "@/services/productService";
import type { Product, ProductListQuery } from "@/types/product";

const TYPE_LABELS: Record<string, string> = { software: "Software", service: "Service", add_on: "Add-on", physical: "Physical" };

export default function Products() {
  const navigate = useNavigate();
  const admin = useIsAdmin();
  const client = useQueryClient();
  const toast = useToast();
  const list = useListQuery({ sortBy: "name" });
  const query = list.query as ProductListQuery;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const products = useQuery({ queryKey: ["products", "list", query], queryFn: () => productService.list(query) });
  const statusMutation = useMutation({
    mutationFn: (product: Product) => productService.update(product.id, { status: product.status === "active" ? "archived" : "active" }),
    onSuccess: (product) => { void client.invalidateQueries({ queryKey: ["products"] }); toast.success(product.status === "active" ? "Product restored." : "Product archived."); setArchiveTarget(null); },
    onError: (error: Error) => toast.error(error.message),
  });
  const columns: Column<Product>[] = [
    { key: "name", header: "Product", sortable: true, render: (p) => <div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary"><Package className="size-4" aria-hidden /></span><div className="min-w-0"><p className="truncate font-semibold text-ink">{p.name}</p><p className="max-w-72 truncate text-xs text-muted">{p.description || "No description"}</p></div></div> },
    { key: "product_type", header: "Type", sortable: true, render: (p) => TYPE_LABELS[p.product_type] ?? p.product_type },
    { key: "sales_price", header: "Sales price", sortable: true, align: "right", render: (p) => <span className="font-semibold">{formatCurrency(p.sales_price)}</span> },
    { key: "cost_price", header: "Cost price", sortable: true, align: "right", render: (p) => p.cost_price == null ? <span className="text-muted">—</span> : formatCurrency(p.cost_price) },
    { key: "variants_count", header: "Variants", align: "right", render: (p) => p.variants_count ?? "—" },
    { key: "plans_count", header: "Plans", align: "right", render: (p) => p.plans_count ?? "—" },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
  ];
  function openForm(product: Product | null = null) { setEditing(product); setFormOpen(true); }
  return <div className="space-y-6">
    <PageHeader title="Products" description="Manage the products and add-ons offered with your subscription plans." actions={admin ? <Button onClick={() => openForm()}><Plus className="size-4" aria-hidden /> New product</Button> : undefined} />
    <DataTable columns={columns} data={products.data} isLoading={products.isPending} isFetching={products.isFetching} isError={products.isError} errorMessage={products.error instanceof Error ? products.error.message : "Could not load products."} onRetry={() => void products.refetch()} list={list} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/products/${p.id}`)} searchPlaceholder="Search products…" filters={<><Select aria-label="Filter product type" className="w-40" options={[{ value: "software", label: "Software" }, { value: "service", label: "Service" }, { value: "add_on", label: "Add-on" }, { value: "physical", label: "Physical" }]} placeholder="All types" value={String(query.product_type ?? "")} onChange={(event) => list.setFilter("product_type", event.target.value || undefined)} /><Select aria-label="Filter product status" className="w-40" options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} placeholder="All statuses" value={String(query.status ?? "")} onChange={(event) => list.setFilter("status", event.target.value || undefined)} /></>} empty={{ icon: <Package />, title: "No products yet", description: "Add a product to make it available for plans and subscriptions.", action: admin ? <Button size="sm" onClick={() => openForm()}><Plus aria-hidden /> New product</Button> : undefined }} rowActions={(product) => [
      { label: "View details", icon: <Eye className="size-4" />, onSelect: () => navigate(`/products/${product.id}`) },
      ...(admin ? [{ label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => openForm(product) }, { label: product.status === "active" ? "Archive" : "Restore", icon: product.status === "active" ? <Archive className="size-4" /> : <RotateCcw className="size-4" />, onSelect: () => setArchiveTarget(product) }] : []),
    ]} />
    {admin && <ProductFormDialog open={formOpen} product={editing} onClose={() => setFormOpen(false)} />}
    <ConfirmDialog open={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} onConfirm={() => archiveTarget && statusMutation.mutate(archiveTarget)} loading={statusMutation.isPending} tone={archiveTarget?.status === "active" ? "danger" : "primary"} title={archiveTarget?.status === "active" ? `Archive ${archiveTarget?.name}?` : `Restore ${archiveTarget?.name}?`} description={archiveTarget?.status === "active" ? "Archived products stay in existing records and can be restored later." : "This product will be available for new plans again."} confirmLabel={archiveTarget?.status === "active" ? "Archive product" : "Restore product"} />
  </div>;
}
