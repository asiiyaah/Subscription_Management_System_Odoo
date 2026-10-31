import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Pencil, Play, Plus, TicketPercent, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Tabs } from "@/components/common/Tabs";
import { formatDiscountConditions, formatDiscountValue } from "@/components/discounts/discountFormat";
import { DiscountFormDialog } from "@/components/discounts/DiscountFormDialog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { MenuAction } from "@/components/ui/DropdownMenu";
import { useToast } from "@/components/ui/Toast";
import { useIsAdmin } from "@/context/AuthContext";
import { useListQuery } from "@/hooks/useListQuery";
import { cn } from "@/lib/cn";
import { formatDate, formatNumber, formatRelativeDays } from "@/lib/format";
import { discountService } from "@/services/discountService";
import type { ApiError } from "@/services/api";
import type { Discount, DiscountListQuery } from "@/types/discount";

const COLUMNS: Column<Discount>[] = [
  {
    key: "code",
    header: "Code",
    sortable: true,
    render: (d) => (
      <div>
        <span className="inline-block rounded-lg border border-dashed border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-primary">
          {d.code}
        </span>
        <p className="mt-1 max-w-56 truncate text-xs text-muted" title={d.name}>
          {d.name}
        </p>
      </div>
    ),
  },
  { key: "value", header: "Discount", sortable: true, render: (d) => <span className="font-semibold">{formatDiscountValue(d)}</span> },
  { key: "conditions", header: "Conditions", render: (d) => <span className="text-muted">{formatDiscountConditions(d)}</span> },
  {
    key: "applies_to",
    header: "Applies to",
    render: (d) =>
      d.applies_to === "subscription" ? (
        "Whole subscription"
      ) : (
        <span title={d.product_names.join(", ")}>
          {d.product_names.length === 1 ? d.product_names[0] : `${d.product_names.length} products`}
        </span>
      ),
  },
  {
    key: "end_date",
    header: "Valid",
    sortable: true,
    render: (d) => (
      <div>
        <div>
          {formatDate(d.start_date)} – {d.end_date ? formatDate(d.end_date) : "No end"}
        </div>
        <div className="text-xs text-muted">
          {d.status === "scheduled"
            ? `Starts ${formatRelativeDays(d.start_date)}`
            : d.end_date && d.status === "active"
              ? `Ends ${formatRelativeDays(d.end_date)}`
              : d.status === "expired" && d.end_date
                ? `Ended ${formatRelativeDays(d.end_date)}`
                : null}
        </div>
      </div>
    ),
  },
  { key: "used_count", header: "Usage", sortable: true, render: (d) => <UsageMeter discount={d} /> },
  { key: "status", header: "Status", render: (d) => <StatusBadge status={d.status} /> },
];

type PendingAction = { kind: "delete" | "deactivate"; discount: Discount } | null;

export default function Discounts() {
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListQuery({ sortBy: "code" });
  const query = list.query as DiscountListQuery;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const discounts = useQuery({
    queryKey: ["discounts", "list", query],
    queryFn: () => discountService.list(query),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({ queryKey: ["discounts", "counts"], queryFn: () => discountService.counts() });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["discounts"] });

  const activeMutation = useMutation<Discount, ApiError, { discount: Discount; active: boolean }>({
    mutationFn: ({ discount, active }) => discountService.setActive(discount.id, active),
    onSuccess: (saved) => {
      toast.success(saved.active ? `${saved.code} activated` : `${saved.code} deactivated`);
      setPending(null);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation<void, ApiError, Discount>({
    mutationFn: (discount) => discountService.remove(discount.id),
    onSuccess: (_, discount) => {
      toast.success(`${discount.code} deleted`);
      setPending(null);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  function openForm(discount: Discount | null) {
    setEditing(discount);
    setFormOpen(true);
  }

  function menuFor(d: Discount): MenuAction[] {
    const items: Array<MenuAction | false> = [
      { label: "Edit", icon: <Pencil />, onSelect: () => openForm(d) },
      d.active
        ? { label: "Deactivate", icon: <Pause />, onSelect: () => setPending({ kind: "deactivate", discount: d }) }
        : { label: "Activate", icon: <Play />, onSelect: () => activeMutation.mutate({ discount: d, active: true }) },
      // Used discounts are kept for invoice history; they can only be deactivated.
      d.used_count === 0 &&
        discountService.capabilities.hardDelete && { label: "Delete", icon: <Trash2 />, tone: "danger", onSelect: () => setPending({ kind: "delete", discount: d }) },
    ];
    return items.filter((item): item is MenuAction => item !== false);
  }

  const c = counts.data;
  const target = pending?.discount;

  return (
    <>
      <PageHeader
        title="Discounts"
        description="Discount rules are applied automatically to the next invoice of every subscription that qualifies."
        actions={
          isAdmin && (
            <Button onClick={() => openForm(null)}>
              <Plus aria-hidden /> New discount
            </Button>
          )
        }
      />

      {!isAdmin && (
        <div className="mb-4">
          <Alert tone="info">You can view discounts. Only an admin can create or change them.</Alert>
        </div>
      )}

      <div className="space-y-4">
        <Tabs
          aria-label="Filter discounts by status"
          value={query.status ?? ""}
          onChange={(value) => list.setFilter("status", value || undefined)}
          tabs={[
            { value: "", label: "All", count: c?.all },
            { value: "active", label: "Active", count: c?.active },
            { value: "scheduled", label: "Scheduled", count: c?.scheduled },
            { value: "expired", label: "Expired", count: c?.expired },
            { value: "used_up", label: "Used up", count: c?.used_up },
            { value: "inactive", label: "Inactive", count: c?.inactive },
          ]}
        />

        <DataTable
          columns={COLUMNS}
          data={discounts.data}
          isLoading={discounts.isPending}
          isFetching={discounts.isFetching}
          isError={discounts.isError}
          errorMessage={discounts.error?.message}
          onRetry={() => discounts.refetch()}
          list={list}
          rowKey={(d) => d.id}
          onRowClick={isAdmin ? (d) => openForm(d) : undefined}
          rowActions={isAdmin ? menuFor : undefined}
          searchPlaceholder="Search code or name…"
          empty={{
            icon: <TicketPercent />,
            title: "No discounts yet",
            description: "Create a discount code — it's applied automatically when a subscription qualifies.",
            action: isAdmin && (
              <Button size="sm" onClick={() => openForm(null)}>
                <Plus aria-hidden /> New discount
              </Button>
            ),
          }}
        />
      </div>

      {isAdmin && (
        <>
          <DiscountFormDialog open={formOpen} discount={editing} onClose={() => setFormOpen(false)} />
          <ConfirmDialog
            open={pending !== null}
            onClose={() => setPending(null)}
            onConfirm={() => {
              if (!pending) return;
              if (pending.kind === "delete") deleteMutation.mutate(pending.discount);
              else activeMutation.mutate({ discount: pending.discount, active: false });
            }}
            loading={deleteMutation.isPending || activeMutation.isPending}
            tone="danger"
            title={pending?.kind === "delete" ? `Delete ${target?.code}?` : `Deactivate ${target?.code}?`}
            description={
              pending?.kind === "delete"
                ? "The discount will be removed permanently. It has never been used, so no invoices are affected."
                : "It will stop applying to new invoices straight away. Invoices already issued keep their discount. You can activate it again later."
            }
            confirmLabel={pending?.kind === "delete" ? "Delete discount" : "Deactivate"}
          />
        </>
      )}
    </>
  );
}

function UsageMeter({ discount }: { discount: Discount }) {
  const { used_count, usage_limit } = discount;
  if (!usage_limit) {
    return (
      <span>
        {formatNumber(used_count)} <span className="text-xs text-muted">· unlimited</span>
      </span>
    );
  }
  const share = Math.min(100, (used_count / usage_limit) * 100);
  return (
    <div className="w-28">
      <div className="text-sm">
        {formatNumber(used_count)} <span className="text-muted">/ {formatNumber(usage_limit)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div
          className={cn("h-full rounded-full", share >= 100 ? "bg-muted" : "bg-gradient-to-r from-primary to-accent")}
          style={{ width: `${share}%` }}
        />
      </div>
    </div>
  );
}
