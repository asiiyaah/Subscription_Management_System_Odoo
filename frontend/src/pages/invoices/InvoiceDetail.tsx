import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Mail, Printer, Send, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { BalanceCard, InvoiceDetailSkeleton, InvoiceDocument, PaymentsCard } from "@/components/invoices/InvoiceDocument";
import { invoiceRules, useInvoiceActions } from "@/components/invoices/useInvoiceActions";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { formatDateTime } from "@/lib/format";
import { invoiceService } from "@/services/invoiceService";
import type { ApiError } from "@/services/api";
import type { Invoice } from "@/types/invoice";

export default function InvoiceDetail() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const { actions, dialogs, isSending } = useInvoiceActions();
  const business = useBusinessSettings();

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

  if (isPending) return <InvoiceDetailSkeleton />;
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
        <InvoiceDocument invoice={invoice} business={business} subscriptionHref={`/subscriptions/${invoice.subscription_id}`} />
        <aside className="space-y-6 print:hidden">
          <BalanceCard invoice={invoice} />
          <PaymentsCard invoice={invoice} />
        </aside>
      </div>

      {dialogs}
    </>
  );
}
