import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { paymentService } from "@/services/paymentService";
import type { ApiError } from "@/services/api";
import { PAYMENT_METHOD_LABELS, type Invoice, type PaymentMethod } from "@/types/invoice";

export interface PayableInvoice {
  id: number;
  number: string;
  customer_name: string;
  balance: number;
}

const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }));
const FORM_ID = "record-payment-form";

/** Record a payment against one invoice (R34). Open it by passing an invoice; close by passing null. */
export function RecordPaymentDialog({ invoice, onClose }: { invoice: PayableInvoice | null; onClose: () => void }) {
  return (
    <Dialog
      open={invoice !== null}
      onClose={onClose}
      title="Record payment"
      description={
        invoice && (
          <>
            {invoice.number} · {invoice.customer_name} · Balance{" "}
            <span className="font-semibold text-ink">{formatCurrency(invoice.balance)}</span>
          </>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID}>
            Save payment
          </Button>
        </>
      }
    >
      {/* Keyed so the form starts fresh for each invoice */}
      {invoice && <PaymentForm key={invoice.id} invoice={invoice} onDone={onClose} />}
    </Dialog>
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
