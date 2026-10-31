import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState } from "@/components/common/States";
import { BalanceCard, InvoiceDetailSkeleton, InvoiceDocument, PaymentsCard } from "@/components/invoices/InvoiceDocument";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { HowToPayCard } from "@/components/portal/HowToPayCard";
import { Button } from "@/components/ui/Button";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { portalService } from "@/services/portalService";
import type { ApiError } from "@/services/api";
import type { Invoice } from "@/types/invoice";

/** One of my invoices (C3a): read-only, printable. Other customers' invoices return "not found". */
export default function MyInvoiceDetail() {
  // Ids are numbers in the mocks and UUID strings from the backend — keep them as text.
  const id = useParams().id ?? "";
  const [params, setParams] = useSearchParams();
  const business = useBusinessSettings();

  const { data: invoice, isPending, isError, error, refetch } = useQuery<Invoice, ApiError>({
    queryKey: ["portal", "invoice", id],
    queryFn: () => portalService.invoice(id),
    enabled: id !== "",
  });

  // "Print / save PDF" from the list arrives with ?print=1 (same pattern as the admin page).
  const printed = useRef(false);
  const printRequested = params.get("print") === "1";
  useEffect(() => {
    if (!printRequested || !invoice || printed.current) return;
    printed.current = true;
    setParams({}, { replace: true });
    setTimeout(() => window.print(), 300);
  }, [printRequested, invoice, setParams]);

  const back = { to: "/portal/invoices", label: "My invoices" };

  if (isPending) return <InvoiceDetailSkeleton />;
  if (isError || !invoice) {
    return (
      <>
        <PageHeader title="Invoice" back={back} />
        <div className="rounded-3xl border border-line bg-surface/70">
          {error?.status === 404 ? (
            <EmptyState title="Invoice not found" description="It may not be yours, or the link is wrong." />
          ) : (
            <ErrorState message={error?.message} onRetry={() => refetch()} />
          )}
        </div>
      </>
    );
  }

  const unpaid = invoice.status === "confirmed" && invoice.balance > 0;
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
          description={invoice.plan_name}
          actions={
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer aria-hidden /> Print / save PDF
            </Button>
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <InvoiceDocument invoice={invoice} business={business} subscriptionHref={`/portal/subscriptions/${invoice.subscription_id}`} />
        <aside className="space-y-6 print:hidden">
          <BalanceCard invoice={invoice} />
          {unpaid && <HowToPayCard reference={invoice.number} />}
          <PaymentsCard invoice={invoice} />
        </aside>
      </div>
    </>
  );
}
