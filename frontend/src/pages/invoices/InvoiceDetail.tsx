import { useEffect, useRef, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Mail, Printer, Send, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { invoiceRules, useInvoiceActions } from "@/components/invoices/useInvoiceActions";
import { BUSINESS } from "@/lib/business";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate, formatDateTime, formatRelativeDays } from "@/lib/format";
import { invoiceService } from "@/services/invoiceService";
import type { ApiError } from "@/services/api";
import { PAYMENT_METHOD_LABELS, type Invoice } from "@/types/invoice";

export default function InvoiceDetail() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const { actions, dialogs, isSending } = useInvoiceActions();

  const { data: invoice, isPending, isError, error, refetch } = useQuery<Invoice, ApiError>({
    queryKey: ["invoices", "detail", id],
    queryFn: () => invoiceService.get(id),
    enabled: Number.isFinite(id),
  });

  // "Print" from the list opens this page with ?print=1 — print once the invoice has loaded.
  // (No cleanup: removing ?print=1 re-runs this effect and would cancel the timer.)
  const printRequested = params.get("print") === "1";
  const printed = useRef(false);
  useEffect(() => {
    if (!printRequested || !invoice || printed.current) return;
    printed.current = true;
    setParams({}, { replace: true });
    setTimeout(() => window.print(), 300);
  }, [printRequested, invoice, setParams]);

  const back = { to: "/invoices", label: "All invoices" };

  if (isPending) return <DetailSkeleton />;
  if (isError || !invoice) {
    return (
      <>
        <PageHeader title="Invoice" back={back} />
        <div className="rounded-3xl border border-line bg-surface/70">
          {error?.status === 404 ? (
            <EmptyState title="Invoice not found" description="It may have been removed, or the link is wrong." />
          ) : (
            <ErrorState message={error?.message} onRetry={() => refetch()} />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          back={back}
          title={
            <span className="flex flex-wrap items-center gap-3">
              {invoice.number}
              <InvoiceStatusBadge invoice={invoice} className="text-sm" />
            </span>
          }
          description={
            <>
              {invoice.customer_name} · {invoice.plan_name}
              {invoice.sent_at && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs">
                  <Mail className="size-3.5" aria-hidden /> Sent {formatDateTime(invoice.sent_at)}
                </span>
              )}
            </>
          }
          actions={
            <>
              {invoiceRules.canCancel(invoice) && (
                <Button variant="ghost" onClick={() => actions.cancel(invoice)}>
                  <Ban aria-hidden /> Cancel
                </Button>
              )}
              {invoice.status !== "draft" && (
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer aria-hidden /> Print
                </Button>
              )}
              {invoiceRules.canSend(invoice) && (
                <Button variant="secondary" onClick={() => actions.send(invoice)} loading={isSending}>
                  <Send aria-hidden /> Send
                </Button>
              )}
              {invoiceRules.canConfirm(invoice) && (
                <Button onClick={() => actions.confirm(invoice)}>
                  <CheckCircle2 aria-hidden /> Confirm invoice
                </Button>
              )}
              {invoiceRules.canPay(invoice) && (
                <Button onClick={() => actions.pay(invoice)}>
                  <Wallet aria-hidden /> Record payment
                </Button>
              )}
            </>
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <InvoiceDocument invoice={invoice} />
        <aside className="space-y-6 print:hidden">
          <BalanceCard invoice={invoice} />
          <PaymentsCard invoice={invoice} />
        </aside>
      </div>

      {dialogs}
    </>
  );
}

/** The printable invoice. `invoice-doc` switches it to black-on-white when printing (see index.css). */
function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  return (
    <article className="invoice-doc rounded-3xl border border-line bg-surface/70 p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          <p className="text-lg font-bold">{BUSINESS.name}</p>
          <p className="mt-1 max-w-xs text-sm text-muted">{BUSINESS.address}</p>
          <p className="text-sm text-muted">
            {BUSINESS.email} · {BUSINESS.phone}
          </p>
          <p className="text-sm text-muted">GSTIN {BUSINESS.gstin}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            {invoice.status === "draft" ? "Draft invoice" : "Tax invoice"}
          </p>
          <p className="mt-1 text-2xl font-extrabold">{invoice.number}</p>
          <div className="mt-2 flex justify-end">
            <InvoiceStatusBadge invoice={invoice} />
          </div>
        </div>
      </header>

      <section className="grid gap-6 border-b border-line py-6 sm:grid-cols-2 lg:grid-cols-3">
        <Meta label="Bill to">
          <p className="font-semibold">{invoice.customer_name}</p>
          <p className="text-muted">{invoice.customer_email}</p>
          {invoice.customer_address && <p className="text-muted">{invoice.customer_address}</p>}
        </Meta>
        <div className="space-y-4">
          <Meta label="Invoice date">{formatDate(invoice.invoice_date)}</Meta>
          <Meta label="Due date">
            <span className={cn(invoice.is_overdue && "font-semibold text-danger")}>{formatDate(invoice.due_date)}</span>
            {invoice.status === "confirmed" && invoice.balance > 0 && (
              <span className={cn("ml-2 text-xs", invoice.is_overdue ? "text-danger" : "text-muted")}>
                ({invoice.is_overdue ? "overdue, " : ""}
                {formatRelativeDays(invoice.due_date)})
              </span>
            )}
          </Meta>
        </div>
        <div className="space-y-4">
          <Meta label="Subscription">
            <Link to={`/subscriptions/${invoice.subscription_id}`} className="font-medium text-primary hover:underline">
              {invoice.subscription_number}
            </Link>
            <span className="text-muted"> · {invoice.plan_name}</span>
          </Meta>
          <Meta label="Billing period">
            {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
          </Meta>
          <Meta label="Payment terms">{invoice.payment_terms}</Meta>
        </div>
      </section>

      <div className="-mx-6 overflow-x-auto sm:-mx-8">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted">
              <th scope="col" className="px-6 py-3 text-left font-semibold sm:pl-8">Product</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Qty</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Unit price</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Tax</th>
              <th scope="col" className="px-6 py-3 text-right font-semibold sm:pr-8">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-t border-line/70">
                <td className="px-6 py-3.5 sm:pl-8">
                  <p className="font-medium">{line.product_name}</p>
                  {line.description && <p className="text-xs text-muted">{line.description}</p>}
                </td>
                <td className="px-3 py-3.5 text-right">{line.quantity}</td>
                <td className="px-3 py-3.5 text-right">{formatCurrency(line.unit_price)}</td>
                <td className="px-3 py-3.5 text-right text-muted">{line.tax_label ?? "—"}</td>
                <td className="px-6 py-3.5 text-right font-medium sm:pr-8">{formatCurrency(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-2 flex justify-end border-t border-line pt-5">
        <dl className="w-full max-w-sm space-y-2 text-sm">
          <TotalRow label="Subtotal" value={formatCurrency(invoice.untaxed_amount)} />
          {invoice.discount && (
            <TotalRow
              label={
                <>
                  Discount <span className="text-xs text-muted">({invoice.discount.code} · {invoice.discount.label})</span>
                </>
              }
              value={`− ${formatCurrency(invoice.discount.amount)}`}
              className="text-success"
            />
          )}
          {invoice.taxes.map((tax) => (
            <TotalRow key={tax.label} label={tax.label} value={formatCurrency(tax.amount)} muted />
          ))}
          <TotalRow label="Total" value={formatCurrency(invoice.total)} strong className="border-t border-line pt-2.5" />
          {invoice.amount_paid > 0 && <TotalRow label="Amount paid" value={`− ${formatCurrency(invoice.amount_paid)}`} muted />}
          {invoice.status !== "cancelled" && (
            <TotalRow
              label="Balance due"
              value={formatCurrency(invoice.balance)}
              strong
              className={cn("rounded-xl px-3 py-2.5", invoice.balance > 0 ? "bg-primary/10 text-primary" : "bg-success/10 text-success")}
            />
          )}
        </dl>
      </section>

      <footer className="mt-8 border-t border-line pt-5 text-xs text-muted">
        Please quote <span className="font-semibold text-ink">{invoice.number}</span> with your payment. Questions? Write to{" "}
        {BUSINESS.email}.
      </footer>
    </article>
  );
}

function BalanceCard({ invoice }: { invoice: Invoice }) {
  const paidShare = invoice.total > 0 ? Math.min(100, (invoice.amount_paid / invoice.total) * 100) : 0;
  return (
    <section className="rounded-3xl border border-line bg-surface/70 p-5">
      <h2 className="text-sm font-semibold text-muted">Balance due</h2>
      <p className={cn("mt-1 text-3xl font-extrabold", invoice.balance > 0 ? "text-ink" : "text-success")}>
        {invoice.status === "cancelled" ? "—" : formatCurrency(invoice.balance)}
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${paidShare}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {formatCurrency(invoice.amount_paid)} paid of {formatCurrency(invoice.total)}
      </p>
    </section>
  );
}

function PaymentsCard({ invoice }: { invoice: Invoice }) {
  return (
    <section className="rounded-3xl border border-line bg-surface/70 p-5">
      <h2 className="text-sm font-semibold text-muted">Payments received</h2>
      {invoice.payments.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No payments yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {invoice.payments.map((payment) => (
            <li key={payment.id} className="rounded-2xl bg-surface-2/50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                <span className="text-xs text-muted">{formatDate(payment.payment_date)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {PAYMENT_METHOD_LABELS[payment.method]}
                {payment.note && ` · ${payment.note}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      {children}
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
  muted,
  className,
}: {
  label: ReactNode;
  value: string;
  strong?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", strong && "text-base font-bold", muted && "text-muted", className)}>
      <dt>{label}</dt>
      <dd className="text-right whitespace-nowrap">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[32rem] rounded-3xl" />
        <div className="space-y-6">
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-48 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
