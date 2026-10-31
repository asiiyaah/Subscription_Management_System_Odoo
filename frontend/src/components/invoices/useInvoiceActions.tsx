import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Eye, Printer, Send, Wallet } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { MenuAction } from "@/components/ui/DropdownMenu";
import { useToast } from "@/components/ui/Toast";
import { RecordPaymentDialog } from "@/components/payments/RecordPaymentDialog";
import { formatCurrency } from "@/lib/format";
import { invoiceService } from "@/services/invoiceService";
import type { ApiError } from "@/services/api";
import type { InvoiceSummaryRow } from "@/types/invoice";

type Pending = { kind: "confirm" | "cancel"; invoice: InvoiceSummaryRow } | null;

/** What each invoice status allows (R24). */
export const invoiceRules = {
  canConfirm: (inv: InvoiceSummaryRow) => inv.status === "draft",
  canPay: (inv: InvoiceSummaryRow) => inv.status === "confirmed" && inv.balance > 0,
  canSend: (inv: InvoiceSummaryRow) => inv.status === "confirmed" || inv.status === "paid",
  canCancel: (inv: InvoiceSummaryRow) =>
    (inv.status === "draft" || inv.status === "confirmed") && inv.amount_paid === 0,
};

/**
 * Confirm / Cancel / Send / Print / Record payment for invoices, with the
 * confirmation dialogs and toasts. Render `dialogs` once on the page.
 */
export function useInvoiceActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending>(null);
  const [paying, setPaying] = useState<InvoiceSummaryRow | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invoices"] });

  const statusMutation = useMutation<unknown, ApiError, Exclude<Pending, null>>({
    mutationFn: ({ kind, invoice }) =>
      kind === "confirm" ? invoiceService.confirm(invoice.id) : invoiceService.cancel(invoice.id),
    onSuccess: (_, { kind, invoice }) => {
      toast.success(kind === "confirm" ? `${invoice.number} confirmed` : `${invoice.number} cancelled`);
      setPending(null);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const sendMutation = useMutation<{ message: string }, ApiError, InvoiceSummaryRow>({
    mutationFn: (invoice) => invoiceService.send(invoice.id),
    onSuccess: ({ message }) => {
      toast.success(message);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const actions = {
    confirm: (invoice: InvoiceSummaryRow) => setPending({ kind: "confirm", invoice }),
    cancel: (invoice: InvoiceSummaryRow) => setPending({ kind: "cancel", invoice }),
    pay: (invoice: InvoiceSummaryRow) => setPaying(invoice),
    send: (invoice: InvoiceSummaryRow) => sendMutation.mutate(invoice),
    /** Opens the invoice page, which prints itself once loaded. */
    print: (invoice: InvoiceSummaryRow) => navigate(`/invoices/${invoice.id}?print=1`),
    view: (invoice: InvoiceSummaryRow) => navigate(`/invoices/${invoice.id}`),
  };

  /** Items for the DataTable "⋯" menu. Only actions the status allows are shown. */
  function menuFor(invoice: InvoiceSummaryRow): MenuAction[] {
    const items: Array<MenuAction | false> = [
      { label: "View", icon: <Eye />, onSelect: () => actions.view(invoice) },
      invoiceRules.canConfirm(invoice) && { label: "Confirm", icon: <CheckCircle2 />, onSelect: () => actions.confirm(invoice) },
      invoiceRules.canPay(invoice) && { label: "Record payment", icon: <Wallet />, onSelect: () => actions.pay(invoice) },
      invoiceRules.canSend(invoice) && { label: "Send to customer", icon: <Send />, onSelect: () => actions.send(invoice) },
      invoice.status !== "draft" && { label: "Print", icon: <Printer />, onSelect: () => actions.print(invoice) },
      invoiceRules.canCancel(invoice) && { label: "Cancel invoice", icon: <Ban />, tone: "danger", onSelect: () => actions.cancel(invoice) },
    ];
    return items.filter((item): item is MenuAction => item !== false);
  }

  const target = pending?.invoice;
  const dialogs = (
    <>
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && statusMutation.mutate(pending)}
        loading={statusMutation.isPending}
        tone={pending?.kind === "cancel" ? "danger" : "primary"}
        title={pending?.kind === "cancel" ? `Cancel ${target?.number}?` : `Confirm ${target?.number}?`}
        description={
          pending?.kind === "cancel"
            ? "The invoice will be cancelled and can no longer be paid. This can't be undone."
            : target && `The invoice for ${formatCurrency(target.total)} will be locked and can then be sent to ${target.customer_name} and paid.`
        }
        confirmLabel={pending?.kind === "cancel" ? "Cancel invoice" : "Confirm invoice"}
      />
      <RecordPaymentDialog invoice={paying} onClose={() => setPaying(null)} />
    </>
  );

  return { actions, menuFor, dialogs, isSending: sendMutation.isPending };
}
