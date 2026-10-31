import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleDollarSign, FileText, Hourglass, Wallet, Zap } from "lucide-react";
import { DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { Skeleton } from "@/components/common/States";
import { Tabs } from "@/components/common/Tabs";
import { Button } from "@/components/ui/Button";
import { GenerateInvoicesDialog } from "@/components/invoices/GenerateInvoicesDialog";
import { invoiceColumns } from "@/components/invoices/invoiceColumns";
import { useInvoiceActions } from "@/components/invoices/useInvoiceActions";
import { useListQuery } from "@/hooks/useListQuery";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { invoiceService } from "@/services/invoiceService";
import type { InvoiceListQuery } from "@/types/invoice";

const COLUMNS = invoiceColumns();

export default function Invoices() {
  const navigate = useNavigate();
  const [generateOpen, setGenerateOpen] = useState(false);
  const list = useListQuery({ sortBy: "invoice_date", sortDir: "desc" });
  const { menuFor, dialogs } = useInvoiceActions();
  const query = list.query as InvoiceListQuery;

  const invoices = useQuery({
    queryKey: ["invoices", "list", query],
    queryFn: () => invoiceService.list(query),
    placeholderData: keepPreviousData,
  });

  const stats = useQuery({
    queryKey: ["invoices", "stats"],
    queryFn: () => invoiceService.stats(),
  });
  const counts = stats.data?.counts;

  // "Overdue" isn't a status — it's a filter on confirmed invoices past their due date.
  const activeTab = query.overdue === "true" ? "overdue" : (query.status ?? "");
  function changeTab(tab: string) {
    if (tab === "overdue") list.setFilters({ overdue: "true", status: undefined });
    else list.setFilters({ status: tab || undefined, overdue: undefined });
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every invoice generated from subscriptions — confirm, send, print and track payments."
        actions={
          <Button onClick={() => setGenerateOpen(true)}>
            <Zap aria-hidden /> Generate due invoices
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={<FileText />}
          label="Total invoiced"
          value={stats.data && formatCurrency(stats.data.total_invoiced)}
          tone="violet"
        />
        <SummaryCard icon={<Wallet />} label="Paid" value={stats.data && formatCurrency(stats.data.total_paid)} tone="success" />
        <SummaryCard
          icon={<Hourglass />}
          label="Outstanding"
          value={stats.data && formatCurrency(stats.data.outstanding)}
          tone="accent"
        />
        <SummaryCard
          icon={<AlertTriangle />}
          label={`Overdue${counts ? ` · ${counts.overdue}` : ""}`}
          value={stats.data && formatCurrency(stats.data.overdue_amount)}
          tone="danger"
          onClick={() => changeTab("overdue")}
        />
      </div>

      <div className="space-y-4">
        <Tabs
          aria-label="Filter invoices by status"
          value={activeTab}
          onChange={changeTab}
          tabs={[
            { value: "", label: "All", count: counts?.all },
            { value: "draft", label: "Draft", count: counts?.draft },
            { value: "confirmed", label: "Confirmed", count: counts?.confirmed },
            { value: "overdue", label: "Overdue", count: counts?.overdue },
            { value: "paid", label: "Paid", count: counts?.paid },
            { value: "cancelled", label: "Cancelled", count: counts?.cancelled },
          ]}
        />

        <DataTable
          columns={COLUMNS}
          data={invoices.data}
          isLoading={invoices.isPending}
          isFetching={invoices.isFetching}
          isError={invoices.isError}
          errorMessage={invoices.error?.message}
          onRetry={() => invoices.refetch()}
          list={list}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/invoices/${row.id}`)}
          rowActions={menuFor}
          searchPlaceholder="Search invoice, customer or subscription…"
          empty={{
            icon: <CircleDollarSign />,
            title: "No invoices yet",
            description: "Generate invoices for subscriptions that are due for billing.",
            action: (
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                <Zap aria-hidden /> Generate due invoices
              </Button>
            ),
          }}
        />
      </div>

      {dialogs}
      <GenerateInvoicesDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onViewDrafts={() => changeTab("draft")}
      />
    </>
  );
}

const TONES = {
  violet: "from-violet/25 to-violet/5 text-violet",
  success: "from-success/25 to-success/5 text-success",
  accent: "from-accent/25 to-accent/5 text-accent",
  danger: "from-danger/25 to-danger/5 text-danger",
};

function SummaryCard({
  icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string | undefined;
  tone: keyof typeof TONES;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-line bg-surface/70 p-4 text-left",
        onClick && "transition hover:border-danger/50 hover:bg-surface",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br [&>svg]:size-5", TONES[tone])}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted">{label}</span>
        {value === undefined ? (
          <Skeleton className="mt-1.5 h-5 w-24" />
        ) : (
          <span className="block truncate text-lg font-bold">{value}</span>
        )}
      </span>
    </Tag>
  );
}
