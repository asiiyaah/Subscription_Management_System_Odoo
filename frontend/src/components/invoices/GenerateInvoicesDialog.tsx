import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { invoiceService } from "@/services/invoiceService";
import type { ApiError } from "@/services/api";
import type { GenerateInvoicesResult } from "@/types/invoice";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after generating, e.g. to switch the list to the Draft tab. */
  onViewDrafts: () => void;
}

/**
 * Billing day (R22, R26): preview which subscriptions are due, then create draft invoices.
 * Already-billed periods are shown as skipped, so nothing is billed twice.
 */
export function GenerateInvoicesDialog({ open, onClose, onViewDrafts }: Props) {
  const queryClient = useQueryClient();

  const preview = useQuery({
    queryKey: ["invoices", "due-preview"],
    queryFn: () => invoiceService.duePreview(),
    enabled: open,
    staleTime: 0,
  });

  const generate = useMutation<GenerateInvoicesResult, ApiError>({
    mutationFn: () => invoiceService.generateDue(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const rows = preview.data ?? [];
  const ready = rows.filter((row) => row.status === "ready");
  const readyTotal = ready.reduce((sum, row) => sum + row.estimated_total, 0);
  const result = generate.data;

  function close() {
    if (generate.isPending) return;
    generate.reset();
    onClose();
  }

  let footer;
  if (result) {
    footer = (
      <>
        <Button variant="secondary" onClick={close}>
          Close
        </Button>
        {result.created > 0 && (
          <Button
            onClick={() => {
              close();
              onViewDrafts();
            }}
          >
            View draft invoices
          </Button>
        )}
      </>
    );
  } else {
    footer = (
      <>
        <Button variant="secondary" onClick={close} disabled={generate.isPending}>
          Cancel
        </Button>
        <Button onClick={() => generate.mutate()} loading={generate.isPending} disabled={ready.length === 0 || preview.isPending}>
          {ready.length > 0 ? `Generate ${ready.length} invoice${ready.length > 1 ? "s" : ""}` : "Nothing to generate"}
        </Button>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Generate due invoices"
      description="Creates a draft invoice for every active subscription whose billing period has started. Review the drafts, then confirm them."
      footer={footer}
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 className="size-12 text-success" aria-hidden />
            <p className="mt-3 text-lg font-semibold">
              {result.created} draft invoice{result.created === 1 ? "" : "s"} created
            </p>
            {result.skipped > 0 && (
              <p className="mt-1 text-sm text-muted">{result.skipped} skipped because they were already billed.</p>
            )}
          </div>
        </div>
      ) : preview.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : preview.isError ? (
        <ErrorState onRetry={() => preview.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalendarClock />} title="No subscriptions are due" description="Come back on the next billing day." />
      ) : (
        <div className="space-y-4">
          {generate.isError && <Alert tone="error">{generate.error.message}</Alert>}

          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Ready to bill" value={String(ready.length)} />
            <Summary label="Already billed (skipped)" value={String(rows.length - ready.length)} />
            <Summary label="Estimated total" value={formatCurrency(readyTotal)} />
          </div>

          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {rows.map((row) => (
              <li
                key={row.subscription_id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {row.customer_name} <span className="font-normal text-muted">· {row.subscription_number}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {row.plan_name} · {formatDate(row.period_start)} – {formatDate(row.period_end)}
                    {row.skip_reason && ` · ${row.skip_reason}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={row.status === "skipped" ? "text-muted line-through" : "font-semibold"}>
                    {formatCurrency(row.estimated_total)}
                  </span>
                  <StatusBadge status={row.status} />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Amounts include discounts and taxes, calculated by the billing engine.</p>
        </div>
      )}
    </Dialog>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2/40 px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}
