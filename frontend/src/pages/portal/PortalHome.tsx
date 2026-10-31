import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ChevronRight, FileText, Hourglass, Repeat } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SummaryCard } from "@/components/common/SummaryCard";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { HowToPayCard } from "@/components/portal/HowToPayCard";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency, formatDate, formatRelativeDays } from "@/lib/format";
import { portalService } from "@/services/portalService";
import type { ApiError } from "@/services/api";
import type { PortalSummary } from "@/types/portal";

/** Customer portal home (C1): what I'm subscribed to, what I owe, and how to pay. */
export default function PortalHome() {
  const { user } = useAuth();
  const summary = useQuery<PortalSummary, ApiError>({ queryKey: ["portal", "summary"], queryFn: () => portalService.summary() });
  const firstName = user?.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hi, {firstName} 👋</h1>
        <p className="mt-1 text-sm text-muted">Your subscriptions and invoices in one place.</p>
      </div>

      {summary.isError ? (
        <div className="rounded-2xl border border-line bg-surface/70">
          <ErrorState message={summary.error.message} onRetry={() => summary.refetch()} />
        </div>
      ) : (
        <Content data={summary.data} />
      )}
    </div>
  );
}

function Content({ data }: { data: PortalSummary | undefined }) {
  const next = data?.next_due;
  return (
    <>
      {data && data.overdue_amount > 0 && next && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden />
          <p className="flex-1">
            <span className="font-semibold">{formatCurrency(data.overdue_amount)} is overdue.</span> Please pay soon to avoid any interruption to your
            service.
          </p>
          <Link to={`/portal/invoices/${next.invoice_id}`} className="font-semibold text-primary hover:underline">
            View {next.number} →
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={<Repeat />} label="Active subscriptions" value={data && String(data.active_subscriptions)} tone="violet" />
        <SummaryCard
          icon={<CalendarClock />}
          label={next ? `Next payment · due ${formatRelativeDays(next.due_date).toLowerCase()}` : "Next payment"}
          value={data && (next ? formatCurrency(next.balance) : "Nothing due")}
          tone={next?.is_overdue ? "danger" : "primary"}
        />
        <SummaryCard icon={<Hourglass />} label="Total outstanding" value={data && formatCurrency(data.outstanding)} tone="accent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Your subscriptions" link={{ to: "/portal/subscriptions", label: "Manage" }}>
            {!data ? (
              <Skeleton className="h-24" />
            ) : data.subscriptions.length === 0 ? (
              <EmptyState icon={<Repeat />} title="No subscriptions yet" description="When our team sets up your plan, it will appear here." />
            ) : (
              <ul className="divide-y divide-line/60">
                {data.subscriptions.map((sub) => (
                  <li key={sub.id}>
                    <Link
                      to={`/portal/subscriptions/${sub.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 transition hover:bg-surface-2/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{sub.plan_name}</p>
                        <p className="text-xs text-muted">
                          {sub.number}
                          {sub.next_invoice_date && ` · next invoice ${formatDate(sub.next_invoice_date)}`}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(sub.monthly_amount)}
                        <span className="text-xs font-normal text-muted">/mo</span>
                      </span>
                      <StatusBadge status={sub.status} />
                      <ChevronRight className="size-4 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Recent invoices" link={{ to: "/portal/invoices", label: "View all" }}>
            {!data ? (
              <Skeleton className="h-32" />
            ) : data.recent_invoices.length === 0 ? (
              <EmptyState icon={<FileText />} title="No invoices yet" description="Your invoices will appear here once you're billed." />
            ) : (
              <ul className="divide-y divide-line/60">
                {data.recent_invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link to={`/portal/invoices/${inv.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition hover:bg-surface-2/40">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{inv.number}</p>
                        <p className="text-xs text-muted">
                          {formatDate(inv.invoice_date)} · due {formatDate(inv.due_date)}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">{formatCurrency(inv.total)}</span>
                      <InvoiceStatusBadge invoice={inv} />
                      <ChevronRight className="size-4 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="space-y-6">
          <HowToPayCard reference={next?.number} />
        </aside>
      </div>
    </>
  );
}

function Section({ title, link, children }: { title: string; link: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface/70">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="font-semibold">{title}</h2>
        <Link to={link.to} className="text-sm font-semibold text-primary hover:underline">
          {link.label}
        </Link>
      </div>
      {children}
    </section>
  );
}
