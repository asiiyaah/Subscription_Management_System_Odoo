import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate, formatRelativeDays } from "@/lib/format";
import { Skeleton } from "@/components/common/States";
import { PAYMENT_METHOD_LABELS, type Invoice } from "@/types/invoice";
import type { BusinessSettings } from "@/types/settings";

// Printable invoice + side cards, shared by the admin invoice page and the customer portal.

/** The printable invoice. `invoice-doc` switches it to black-on-white when printing (see index.css). */
export function InvoiceDocument({
  invoice,
  business,
  subscriptionHref,
}: {
  invoice: Invoice;
  /** Seller details from Settings → Business. */
  business: BusinessSettings;
  /** Where the subscription number links to (admin vs portal). */
  subscriptionHref: string;
}) {
  const awaitingPayment = invoice.status === "confirmed" && invoice.balance > 0;

  return (
    <article className="invoice-doc rounded-3xl border border-line bg-surface/70 p-6 sm:p-8">
      {/* Seller + invoice number */}
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <p className="text-lg font-bold">{business.company_name}</p>
          <div className="mt-1.5 space-y-0.5 text-sm text-muted">
            <p>{business.address}</p>
            <p>
              {business.email} · {business.phone}
            </p>
            <p>GSTIN {business.gstin}</p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            {invoice.status === "draft" ? "Draft invoice" : "Tax invoice"}
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight">{invoice.number}</p>
          <InvoiceStatusBadge invoice={invoice} className="mt-2" />
        </div>
      </header>

      {/* Customer (left) + invoice facts in an even 2 × 3 grid (right) */}
      <section className="mt-8 grid gap-8 border-y border-line py-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <FieldLabel>Bill to</FieldLabel>
          <p className="font-semibold">{invoice.customer_name}</p>
          <div className="mt-1 space-y-0.5 text-sm text-muted">
            <p>{invoice.customer_email}</p>
            {invoice.customer_address && <p>{invoice.customer_address}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
          <Field label="Invoice date">{formatDate(invoice.invoice_date)}</Field>
          <Field label="Due date">
            <span className={cn(invoice.is_overdue && "font-semibold text-danger")}>{formatDate(invoice.due_date)}</span>
            {awaitingPayment && (
              <span className={cn("block text-xs", invoice.is_overdue ? "text-danger/80" : "text-muted")}>
                {invoice.is_overdue ? `Overdue · ${formatRelativeDays(invoice.due_date)}` : formatRelativeDays(invoice.due_date)}
              </span>
            )}
          </Field>
          <Field label="Billing period">
            {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
          </Field>
          <Field label="Payment terms">{invoice.payment_terms}</Field>
          <Field label="Subscription">
            <Link to={subscriptionHref} className="font-medium text-primary hover:underline">
              {invoice.subscription_number}
            </Link>
          </Field>
          <Field label="Plan">{invoice.plan_name}</Field>
        </dl>
      </section>

      {/* Lines — first/last columns sit flush with the card padding so every divider lines up */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <th scope="col" className="py-3 pr-4 text-left font-semibold">Product</th>
              <th scope="col" className="w-16 px-4 py-3 text-right font-semibold">Qty</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Unit price</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Tax</th>
              <th scope="col" className="py-3 pl-4 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b border-line/60 align-top">
                <td className="py-4 pr-4">
                  <p className="font-medium">{line.product_name}</p>
                  {line.description && <p className="mt-0.5 text-xs text-muted">{line.description}</p>}
                </td>
                <td className="px-4 py-4 text-right tabular-nums">{line.quantity}</td>
                <td className="px-4 py-4 text-right tabular-nums">{formatCurrency(line.unit_price)}</td>
                <td className="px-4 py-4 text-right text-muted">{line.tax_label ?? "—"}</td>
                <td className="py-4 pl-4 text-right font-medium tabular-nums">{formatCurrency(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment info (left) + totals (right). On phones the totals come first. */}
      <section className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="order-2 text-sm md:order-1">
          <FieldLabel>Payment information</FieldLabel>
          <p className="text-muted">
            Pay by UPI or bank transfer and use <span className="font-semibold text-ink">{invoice.number}</span> as the
            reference.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
            <dt className="text-muted">UPI</dt>
            <dd>{business.bank.upi}</dd>
            <dt className="text-muted">Bank</dt>
            <dd>{business.bank.name}</dd>
            <dt className="text-muted">Account</dt>
            <dd className="tabular-nums">{business.bank.account}</dd>
            <dt className="text-muted">IFSC</dt>
            <dd>{business.bank.ifsc}</dd>
          </dl>
        </div>

        <dl className="order-1 space-y-2.5 text-sm md:order-2">
          <TotalRow label="Subtotal" value={formatCurrency(invoice.untaxed_amount)} />
          {invoice.discount && (
            <TotalRow
              label={
                <>
                  Discount
                  <span className="block text-xs text-muted">
                    {invoice.discount.code} · {invoice.discount.label}
                  </span>
                </>
              }
              value={`− ${formatCurrency(invoice.discount.amount)}`}
              className="text-success"
            />
          )}
          {invoice.taxes.map((tax) => (
            <TotalRow key={tax.label} label={tax.label} value={formatCurrency(tax.amount)} muted />
          ))}
          <TotalRow label="Total" value={formatCurrency(invoice.total)} strong className="border-t border-line pt-3" />
          {invoice.amount_paid > 0 && <TotalRow label="Amount paid" value={`− ${formatCurrency(invoice.amount_paid)}`} muted />}
          {invoice.status !== "cancelled" && (
            // -mx-3 + px-3: the highlight extends past the column but the text stays aligned with the rows above
            <TotalRow
              label="Balance due"
              value={formatCurrency(invoice.balance)}
              strong
              className={cn(
                "-mx-3 rounded-xl px-3 py-2.5",
                invoice.balance > 0 ? "bg-primary/10 text-primary" : "bg-success/10 text-success",
              )}
            />
          )}
        </dl>
      </section>

      <footer className="mt-8 border-t border-line pt-5 text-xs text-muted">
        Thank you for your business. Questions about this invoice? Write to {business.email}.
      </footer>
    </article>
  );
}

export function BalanceCard({ invoice }: { invoice: Invoice }) {
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

export function PaymentsCard({ invoice }: { invoice: Invoice }) {
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
                {payment.number} · {PAYMENT_METHOD_LABELS[payment.method]}
                {payment.note && ` · ${payment.note}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{children}</p>;
}

/** One label/value pair inside a <dl>. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd>{children}</dd>
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
      <dd className="text-right whitespace-nowrap tabular-nums">{value}</dd>
    </div>
  );
}

export function InvoiceDetailSkeleton() {
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
