import { Landmark, Smartphone } from "lucide-react";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";

/**
 * There's no online payment gateway, so customers pay by UPI or bank transfer and the
 * team records it (R34). This card shows where to pay, from Settings → Business.
 */
export function HowToPayCard({ reference }: { reference?: string }) {
  const { bank, company_name } = useBusinessSettings();
  return (
    <section className="rounded-2xl border border-line bg-surface/70 p-5">
      <h2 className="font-semibold">How to pay</h2>
      <p className="mt-1 text-sm text-muted">
        Use {reference ? <span className="font-semibold text-ink">{reference}</span> : "your invoice number"} as the payment reference. Payments
        show here once our team records them, usually within a working day.
      </p>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex gap-3">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div>
            <dt className="text-xs text-muted">UPI</dt>
            <dd className="font-mono font-medium">{bank.upi}</dd>
          </div>
        </div>
        <div className="flex gap-3">
          <Landmark className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div>
            <dt className="text-xs text-muted">Bank transfer to {company_name}</dt>
            <dd>{bank.name}</dd>
            <dd className="tabular-nums">
              A/c {bank.account} · IFSC {bank.ifsc}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}
