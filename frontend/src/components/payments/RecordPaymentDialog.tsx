import { useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ErrorState, Skeleton } from "@/components/common/States";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { useListQuery } from "@/hooks/useListQuery";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate } from "@/lib/format";
import { invoiceService } from "@/services/invoiceService";
import { paymentService } from "@/services/paymentService";
import type { ApiError } from "@/services/api";
import { PAYMENT_METHOD_LABELS, type Invoice, type InvoiceListQuery, type PaymentMethod } from "@/types/invoice";

export interface PayableInvoice {
  id: number;
  number: string;
  customer_name: string;
  balance: number;
}

const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }));
const FORM_ID = "record-payment-form";

interface RecordPaymentDialogProps {
  /** The invoice being paid. Passing one opens the dialog straight on the payment form. */
  invoice: PayableInvoice | null;
  /** Open without an invoice (Payments page) — the user picks one first. */
  open?: boolean;
  onClose: () => void;
}

/**
 * Record a payment against an invoice (R34).
 * - From an invoice: <RecordPaymentDialog invoice={inv} onClose={…} /> (pass null to close)
 * - From the Payments page: <RecordPaymentDialog open={isOpen} invoice={null} onClose={…} />
 */
export function RecordPaymentDialog({ invoice, open, onClose }: RecordPaymentDialogProps) {
  const [picked, setPicked] = useState<PayableInvoice | null>(null);
  const chosen = invoice ?? picked;

  function close() {
    setPicked(null);
    onClose();
  }

  return (
    <Dialog
      open={open ?? invoice !== null}
      onClose={close}
      title="Record payment"
      description={
        chosen ? (
          <>
            {chosen.number} · {chosen.customer_name} · Balance{" "}
            <span className="font-semibold text-ink">{formatCurrency(chosen.balance)}</span>
          </>
        ) : (
          "Choose the invoice this payment is for."
        )
      }
      footer={
        <>
          {picked && !invoice && (
            <Button variant="ghost" className="mr-auto" onClick={() => setPicked(null)}>
              Change invoice
            </Button>
          )}
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={!chosen}>
            Save payment
          </Button>
        </>
      }
    >
      {/* Keyed so the form starts fresh for each invoice */}
      {chosen ? <PaymentForm key={chosen.id} invoice={chosen} onDone={close} /> : <InvoicePicker onPick={setPicked} />}
    </Dialog>
  );
}

/** Searchable list of invoices that can take a payment (confirmed, balance > 0). */
function InvoicePicker({ onPick }: { onPick: (invoice: PayableInvoice) => void }) {
  const list = useListQuery({ pageSize: 6, sortBy: "due_date", sortDir: "asc", inUrl: false });
  const query: InvoiceListQuery = { ...list.query, status: "confirmed" };
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["invoices", "list", query],
    queryFn: () => invoiceService.list(query),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search invoices</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          autoFocus
          value={list.searchInput}
          onChange={(event) => list.setSearchInput(event.target.value)}
          placeholder="Search invoice number or customer…"
          className="h-11 w-full rounded-xl border border-line bg-surface-2/60 pl-10 pr-3 text-sm placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20"
        />
      </label>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isPending ? (
        Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)
      ) : data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {list.query.search ? "No unpaid invoices match your search." : "There are no unpaid invoices."}
        </p>
      ) : (
        <ul className="space-y-2">
          {data.items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onPick(row)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-left text-sm transition hover:border-primary/60 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {row.number} <span className="font-normal text-muted">· {row.customer_name}</span>
                  </span>
                  <span className={cn("block text-xs", row.is_overdue ? "text-danger" : "text-muted")}>
                    Due {formatDate(row.due_date)}
                    {row.is_overdue && " · overdue"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold">{formatCurrency(row.balance)}</span>
                  <span className="block text-xs text-muted">balance</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > data.items.length && (
        <p className="text-center text-xs text-muted">
          Showing {data.items.length} of {data.total} — search to narrow down.
        </p>
      )}
    </div>
  );
}

function PaymentForm({ invoice, onDone }: { invoice: PayableInvoice; onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [amount, setAmount] = useState(String(invoice.balance));
  const [date, setDate] = useState(todayIso);
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  const mutation = useMutation<Invoice, ApiError>({
    mutationFn: () =>
      paymentService.record({
        invoice_id: invoice.id,
        amount: Number(amount),
        payment_date: date,
        method,
        note: note.trim() || undefined,
      }),
    onSuccess: (updated) => {
      toast.success(
        updated.status === "paid"
          ? `${updated.number} is now fully paid`
          : `Payment recorded · ${formatCurrency(updated.balance)} still due`,
      );
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      onDone();
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    const value = Number(amount);
    const next: typeof errors = {};
    if (!(value > 0)) next.amount = "Enter an amount greater than 0.";
    else if (value > invoice.balance) next.amount = `Can't be more than the balance (${formatCurrency(invoice.balance)}).`;
    if (!date) next.date = "Choose the payment date.";
    else if (date > todayIso) next.date = "Payment date can't be in the future.";
    setErrors(next);
    if (Object.keys(next).length === 0) mutation.mutate();
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      {mutation.isError && (
        <div className="sm:col-span-2">
          <Alert tone="error">{mutation.error.message}</Alert>
        </div>
      )}
      <TextField
        label="Amount (₹)"
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        error={errors.amount}
        hint={
          Number(amount) !== invoice.balance ? (
            <button
              type="button"
              onClick={() => setAmount(String(invoice.balance))}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Pay full balance
            </button>
          ) : null
        }
      />
      <TextField
        label="Payment date"
        type="date"
        max={todayIso}
        value={date}
        onChange={(event) => setDate(event.target.value)}
        error={errors.date}
      />
      <Select
        label="Method"
        className="sm:col-span-2"
        options={METHOD_OPTIONS}
        value={method}
        onChange={(event) => setMethod(event.target.value as PaymentMethod)}
      />
      <Textarea
        label="Note (optional)"
        className="sm:col-span-2"
        placeholder="e.g. UTR / cheque number, who paid"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {mutation.isPending && <p className="text-sm text-muted sm:col-span-2">Saving payment…</p>}
    </form>
  );
}
