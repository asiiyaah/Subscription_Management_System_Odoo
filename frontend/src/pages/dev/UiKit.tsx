// Living reference for the shared components. Dev-only route: /ui-kit
// Copy the patterns from here when building a module page.
import { useState, type FormEvent, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Ban, Eye, Plus, Send, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Tabs } from "@/components/common/Tabs";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { useListQuery } from "@/hooks/useListQuery";
import { formatCurrency, formatDate, formatRelativeDays, toIsoDate } from "@/lib/format";
import { mockDelay, paginate } from "@/mocks/utils";
import type { ListQuery, Paginated } from "@/types/common";

// --- Sample data (stand-in for a real service + mock file) -------------------

interface SampleRow {
  id: number;
  number: string;
  customer: string;
  amount: number;
  due_date: string;
  status: "draft" | "confirmed" | "paid" | "cancelled";
}

const CUSTOMERS = ["Acme Retail", "Nova Labs", "Pixel Studio", "Green Grocers", "Urban Fitness", "Zen Clinic"];
const STATUSES: SampleRow["status"][] = ["draft", "confirmed", "paid", "cancelled"];

const SAMPLE_ROWS: SampleRow[] = Array.from({ length: 57 }, (_, i) => ({
  id: i + 1,
  number: `INV-${String(i + 1).padStart(4, "0")}`,
  customer: CUSTOMERS[i % CUSTOMERS.length],
  amount: 499 + ((i * 7919) % 4500),
  due_date: new Date(Date.now() + (i - 20) * 86_400_000).toISOString(),
  status: STATUSES[(i * 3) % STATUSES.length],
}));

async function listSampleRows(query: ListQuery): Promise<Paginated<SampleRow>> {
  await mockDelay(400);
  return paginate(SAMPLE_ROWS, query, ["number", "customer"]);
}

const STATUS_TABS = [
  { value: "", label: "All", count: SAMPLE_ROWS.length },
  ...STATUSES.map((status) => ({
    value: status,
    label: status[0].toUpperCase() + status.slice(1),
    count: SAMPLE_ROWS.filter((row) => row.status === status).length,
  })),
];

// --- Page ---------------------------------------------------------------------

export default function UiKit() {
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState<SampleRow | null>(null);
  const [confirming, setConfirming] = useState(false);

  // 1. List state lives in the URL (page, search, sort, filters)
  const list = useListQuery({ sortBy: "due_date", sortDir: "asc" });

  // 2. Fetch the current page; keepPreviousData avoids flashing skeletons between pages
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ["ui-kit-sample", list.query],
    queryFn: () => listSampleRows(list.query),
    placeholderData: keepPreviousData,
  });

  // 3. Columns: key = API field (also the sort key), render = custom cell
  const columns: Column<SampleRow>[] = [
    { key: "number", header: "Number", sortable: true, render: (row) => <span className="font-semibold">{row.number}</span> },
    { key: "customer", header: "Customer", sortable: true },
    {
      key: "due_date",
      header: "Due",
      sortable: true,
      render: (row) => (
        <div>
          <div>{formatDate(row.due_date)}</div>
          <div className="text-xs text-muted">{formatRelativeDays(row.due_date)}</div>
        </div>
      ),
    },
    { key: "amount", header: "Amount", sortable: true, align: "right", render: (row) => formatCurrency(row.amount) },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
  ];

  async function handleConfirm() {
    setConfirming(true);
    await mockDelay(600);
    setConfirming(false);
    toast.success(`${confirmRow?.number} cancelled`);
    setConfirmRow(null);
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="UI Kit"
        description="Shared components for every module. Dev-only page — copy patterns from src/pages/dev/UiKit.tsx."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus aria-hidden /> Open form dialog
          </Button>
        }
      />

      <Section title="DataTable + useListQuery + Tabs" note="Server-side search, sort, filter and pagination. Try searching 'acme', sorting, paging.">
        <div className="space-y-4">
          <Tabs
            aria-label="Filter by status"
            tabs={STATUS_TABS}
            value={String(list.query.status ?? "")}
            onChange={(value) => list.setFilter("status", value || undefined)}
          />
          <DataTable
            columns={columns}
            data={data}
            isLoading={isPending}
            isFetching={isFetching}
            isError={isError}
            onRetry={() => refetch()}
            list={list}
            rowKey={(row) => row.id}
            onRowClick={(row) => toast.info(`Open ${row.number} detail page`)}
            rowActions={(row) => [
              { label: "View", icon: <Eye />, onSelect: () => toast.info(`View ${row.number}`) },
              { label: "Send", icon: <Send />, onSelect: () => toast.success(`${row.number} sent`) },
              { label: "Record payment", icon: <Wallet />, onSelect: () => toast.info("Payment dialog"), disabled: row.status !== "confirmed" },
              { label: "Cancel", icon: <Ban />, tone: "danger", onSelect: () => setConfirmRow(row), disabled: row.status === "cancelled" },
            ]}
            searchPlaceholder="Search number or customer…"
            filters={
              <Select
                aria-label="Customer"
                placeholder="All customers"
                options={CUSTOMERS.map((name) => ({ value: name, label: name }))}
                value={String(list.query.customer ?? "")}
                onChange={(event) => list.setFilter("customer", event.target.value || undefined)}
              />
            }
            empty={{ title: "No invoices yet", description: "Invoices appear here once subscriptions are billed." }}
          />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Saving…</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">
            <Plus aria-hidden /> Small
          </Button>
          <Button size="sm" variant="secondary">
            Small secondary
          </Button>
        </div>
      </Section>

      <Section title="StatusBadge" note="Pass the API status string; colours are shared across modules.">
        <div className="flex flex-wrap gap-2">
          {["draft", "quotation", "confirmed", "active", "paused", "closed", "paid", "partially_paid", "overdue", "cancelled", "scheduled", "expired", "used_up"].map(
            (status) => (
              <StatusBadge key={status} status={status} />
            ),
          )}
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <TextField label="Customer name" placeholder="Acme Retail" />
          <TextField label="Amount" type="number" placeholder="0.00" error="Amount must be greater than 0." />
          <Select
            label="Billing period"
            placeholder="Choose…"
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly" },
            ]}
          />
          <Select label="Payment method" options={[{ value: "upi", label: "UPI" }, { value: "cash", label: "Cash" }]} />
          <Textarea label="Note" placeholder="Optional note" className="sm:col-span-2" />
        </div>
      </Section>

      <Section title="Feedback">
        <div className="grid max-w-3xl gap-3">
          <Alert tone="success">Invoice INV-0042 marked as paid.</Alert>
          <Alert tone="error">This discount code has expired.</Alert>
          <Alert tone="info">3 subscriptions were skipped because they were already billed.</Alert>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={() => toast.success("Payment recorded")}>
              Success toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.error("Couldn't send the invoice")}>
              Error toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.info("Reminder scheduled")}>
              Info toast
            </Button>
          </div>
        </div>
      </Section>

      <Section title="States" note="DataTable uses these automatically; use them directly on cards and detail pages.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <div className="space-y-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
          </Card>
          <Card>
            <EmptyState title="No payments yet" description="Recorded payments show up here." action={<Button size="sm">Record payment</Button>} />
          </Card>
          <Card>
            <ErrorState onRetry={() => toast.info("Retrying…")} />
          </Card>
        </div>
      </Section>

      <SampleFormDialog open={formOpen} onClose={() => setFormOpen(false)} />

      <ConfirmDialog
        open={confirmRow !== null}
        onClose={() => setConfirmRow(null)}
        onConfirm={handleConfirm}
        loading={confirming}
        tone="danger"
        title={`Cancel ${confirmRow?.number ?? ""}?`}
        description="The invoice will be marked as cancelled and can't be paid. This can't be undone."
        confirmLabel="Cancel invoice"
      />
    </div>
  );
}

/** Pattern for create/edit dialogs: the form lives in the body, submit button in the footer via form="…". */
function SampleFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!(Number(amount) > 0)) {
      setError("Amount must be greater than 0.");
      return;
    }
    toast.success(`Payment of ${formatCurrency(Number(amount))} recorded`);
    setAmount("");
    setError(undefined);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record payment"
      description="Against invoice INV-0042 · Balance ₹2,499.00"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="sample-form">
            Save payment
          </Button>
        </>
      }
    >
      <form id="sample-form" onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Amount (₹)"
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={error}
          autoFocus
        />
        <TextField label="Payment date" type="date" defaultValue={toIsoDate()} />
        <Select
          label="Method"
          className="sm:col-span-2"
          options={[
            { value: "upi", label: "UPI" },
            { value: "bank_transfer", label: "Bank transfer" },
            { value: "card", label: "Card" },
            { value: "cash", label: "Cash" },
          ]}
        />
        <Textarea label="Note" className="sm:col-span-2" placeholder="e.g. UTR 4829…" />
      </form>
    </Dialog>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-line bg-surface">{children}</div>;
}
