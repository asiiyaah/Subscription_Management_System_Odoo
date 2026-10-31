import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Pencil, Play, Plus, Percent, Star, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TaxFormDialog } from "@/components/taxes/TaxFormDialog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu, type MenuAction } from "@/components/ui/DropdownMenu";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber } from "@/lib/format";
import { taxService } from "@/services/taxService";
import type { ApiError } from "@/services/api";
import type { TaxRule } from "@/types/tax";

/** Tax rules (R23). Admin-only page — the route is guarded in ./routes.tsx. */
export default function Taxes() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRule | null>(null);
  const [deleting, setDeleting] = useState<TaxRule | null>(null);

  const taxes = useQuery({ queryKey: ["taxes"], queryFn: () => taxService.list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["taxes"] });

  const onError = (error: ApiError) => toast.error(error.message);

  const defaultMutation = useMutation<TaxRule, ApiError, TaxRule>({
    mutationFn: (tax) => taxService.setDefault(tax.id),
    onSuccess: (tax) => {
      toast.success(`${tax.name} is now the default tax`);
      refresh();
    },
    onError,
  });

  const activeMutation = useMutation<TaxRule, ApiError, { tax: TaxRule; active: boolean }>({
    mutationFn: ({ tax, active }) => taxService.setActive(tax.id, active),
    onSuccess: (tax) => {
      toast.success(tax.active ? `${tax.name} activated` : `${tax.name} deactivated`);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation<void, ApiError, TaxRule>({
    mutationFn: (tax) => taxService.remove(tax.id),
    onSuccess: (_, tax) => {
      toast.success(`${tax.name} deleted`);
      setDeleting(null);
      refresh();
    },
    onError,
  });

  function openForm(tax: TaxRule | null) {
    setEditing(tax);
    setFormOpen(true);
  }

  function menuFor(tax: TaxRule): MenuAction[] {
    // The default tax is always active and can't be removed — another rule must become default first.
    const items: Array<MenuAction | false> = [
      { label: "Edit", icon: <Pencil />, onSelect: () => openForm(tax) },
      !tax.is_default && tax.active && { label: "Make default", icon: <Star />, onSelect: () => defaultMutation.mutate(tax) },
      !tax.is_default &&
        (tax.active
          ? { label: "Deactivate", icon: <Pause />, onSelect: () => activeMutation.mutate({ tax, active: false }) }
          : { label: "Activate", icon: <Play />, onSelect: () => activeMutation.mutate({ tax, active: true }) }),
      // Live backend only deactivates, which "Deactivate" already covers.
      !tax.is_default && taxService.capabilities.hardDelete && { label: "Delete", icon: <Trash2 />, tone: "danger", onSelect: () => setDeleting(tax) },
    ];
    return items.filter((item): item is MenuAction => item !== false);
  }

  return (
    <>
      <PageHeader
        title="Taxes"
        description="Tax rules the billing engine applies to every subscription and invoice line."
        actions={
          <Button onClick={() => openForm(null)}>
            <Plus aria-hidden /> New tax rule
          </Button>
        }
      />

      <div className="mb-6">
        <Alert tone="info">
          A product uses the rules that name it. Products with no specific rule use the <strong>default</strong> tax.
          Changes apply to new invoices only — issued invoices keep their taxes.
        </Alert>
      </div>

      {taxes.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : taxes.isError ? (
        <div className="rounded-2xl border border-line bg-surface/70">
          <ErrorState message={taxes.error.message} onRetry={() => taxes.refetch()} />
        </div>
      ) : taxes.data.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface/70">
          <EmptyState
            icon={<Percent />}
            title="No tax rules yet"
            description="Add your standard tax (e.g. GST 18%) and make it the default."
            action={
              <Button size="sm" onClick={() => openForm(null)}>
                <Plus aria-hidden /> New tax rule
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {taxes.data.map((tax) => (
            <li key={tax.id}>
              <TaxCard tax={tax} actions={menuFor(tax)} onEdit={() => openForm(tax)} />
            </li>
          ))}
        </ul>
      )}

      <TaxFormDialog open={formOpen} tax={editing} onClose={() => setFormOpen(false)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        tone="danger"
        title={`Delete ${deleting?.name ?? ""}?`}
        description="It will no longer be applied to new invoices. Invoices already issued keep their taxes."
        confirmLabel="Delete tax rule"
      />
    </>
  );
}

function TaxCard({ tax, actions, onEdit }: { tax: TaxRule; actions: MenuAction[]; onEdit: () => void }) {
  const rate = tax.type === "percentage" ? `${formatNumber(tax.rate)}%` : formatCurrency(tax.rate);
  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-2xl border bg-surface/70 p-5 transition",
        tax.is_default ? "border-primary/50 shadow-lg shadow-primary/10" : "border-line",
        !tax.active && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onEdit} className="text-left font-semibold hover:text-primary">
            {tax.name}
          </button>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tax.is_default && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-accent px-2.5 py-0.5 text-xs font-semibold text-white">
                <Star className="size-3" aria-hidden /> Default
              </span>
            )}
            <StatusBadge status={tax.active ? "active" : "inactive"} />
          </div>
        </div>
        <DropdownMenu actions={actions} label={`Actions for ${tax.name}`} />
      </div>

      <p className="mt-5 text-3xl font-extrabold tracking-tight">
        {rate}
        {tax.type === "fixed" && <span className="ml-1 text-sm font-medium text-muted">per unit</span>}
      </p>

      <div className="mt-auto pt-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Applies to</p>
        <p className="mt-1">
          {tax.applies_to === "all" ? (
            tax.is_default ? "All products without a specific rule" : "All products"
          ) : (
            <span className="text-ink">{tax.product_names.join(", ")}</span>
          )}
        </p>
      </div>
    </article>
  );
}
