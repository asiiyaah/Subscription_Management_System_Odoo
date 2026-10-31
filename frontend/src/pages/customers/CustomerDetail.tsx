import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Mail,
  MapPin,
  Phone,
  Repeat,
  UserCircle2,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, type TabOption } from "@/components/common/Tabs";
import { ErrorState, Skeleton } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { customerService } from "@/services/customerService";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import { InvoiceTable } from "@/components/invoices/InvoiceTable";
import { CustomerPaymentTable } from "@/components/payments/CustomerPaymentTable";
import type { Id } from "@/types/common";

const TABS: TabOption[] = [
  { value: "overview", label: "Overview" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "invoices", label: "Invoices" },
  { value: "payments", label: "Payments" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted [&>svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading state
// ---------------------------------------------------------------------------
function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-56" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
function SubscriptionsTab({ customerId }: { customerId: Id }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-8 text-center">
      <Repeat className="mx-auto mb-3 size-10 text-muted/40" aria-hidden />
      <p className="font-semibold text-ink">Subscriptions</p>
      <p className="mt-1 text-sm text-muted">
        View this customer's subscriptions in the subscriptions workspace.
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-4"
        onClick={() => (window.location.href = `/subscriptions?customer_id=${encodeURIComponent(String(customerId))}`)}
      >
        View all subscriptions
      </Button>
    </div>
  );
}

function InvoicesTab({ customerId }: { customerId: Id }) {
  return <InvoiceTable customerId={customerId} pageSize={10} />;
}

function PaymentsTab({ customerId }: { customerId: Id }) {
  return <CustomerPaymentTable customerId={customerId} />;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const customerId = id ?? "";

  const [activeTab, setActiveTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);

  const {
    data: customer,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customerService.getById(customerId),
    enabled: Boolean(customerId),
  });

  if (isLoading) return <DetailSkeleton />;

  if (isError) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : "Could not load customer details."}
        onRetry={refetch}
      />
    );
  }

  if (!customer) return null;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        back={{ to: "/customers", label: "Back to Customers" }}
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-lg font-bold text-primary ring-2 ring-primary/20">
              {customer.name.charAt(0).toUpperCase()}
            </span>
            {customer.name}
          </span>
        }
        description={customer.company ?? customer.email}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </Button>
            {!customer.portal_access && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/customers?invite=${customer.id}`)}
              >
                <Mail className="size-4" aria-hidden />
                Invite to portal
              </Button>
            )}
          </>
        }
      />

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Active subscriptions"
          value={customer.active_subscriptions}
          sub={customer.active_subscriptions === 1 ? "1 active plan" : `${customer.active_subscriptions} active plans`}
        />
        <StatCard
          label="Total paid"
          value={<span className="text-success">{formatCurrency(customer.total_paid)}</span>}
        />
        <StatCard
          label="Outstanding"
          value={
            customer.outstanding_amount > 0 ? (
              <span className="text-danger">{formatCurrency(customer.outstanding_amount)}</span>
            ) : (
              <span className="text-muted">₹0</span>
            )
          }
        />
        <StatCard
          label="Customer since"
          value={formatDate(customer.customer_since)}
        />
      </div>

      {/* Contact card */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Contact information
          </h2>
          <StatusBadge status={customer.portal_access ? "active" : "inactive"} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow icon={<UserCircle2 />} label="Full name" value={customer.name} />
          <InfoRow icon={<Mail />} label="Email" value={customer.email} />
          {customer.phone && (
            <InfoRow icon={<Phone />} label="Phone" value={customer.phone} />
          )}
          {customer.company && (
            <InfoRow icon={<Building2 />} label="Company" value={customer.company} />
          )}
          {customer.billing_address && (
            <InfoRow
              icon={<MapPin />}
              label="Billing address"
              value={customer.billing_address}
            />
          )}
          <InfoRow
            icon={<CalendarDays />}
            label="Added on"
            value={formatDate(customer.created_at)}
          />
        </div>
      </div>

      {/* Tabbed sections */}
      <div className="space-y-4">
        <Tabs
          tabs={TABS}
          value={activeTab}
          onChange={setActiveTab}
          aria-label="Customer sections"
        />

        {activeTab === "overview" && (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
              Activity summary
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-surface-2/40 px-4 py-3">
                <span className="text-sm text-muted">Subscriptions</span>
                <span className="font-semibold text-ink">{customer.active_subscriptions} active</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface-2/40 px-4 py-3">
                <span className="text-sm text-muted">Total amount paid</span>
                <span className="font-semibold text-success">{formatCurrency(customer.total_paid)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface-2/40 px-4 py-3">
                <span className="text-sm text-muted">Outstanding balance</span>
                <span className={`font-semibold ${customer.outstanding_amount > 0 ? "text-danger" : "text-muted"}`}>
                  {formatCurrency(customer.outstanding_amount)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface-2/40 px-4 py-3">
                <span className="text-sm text-muted">Portal access</span>
                <StatusBadge status={customer.portal_access ? "active" : "inactive"} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "subscriptions" && <SubscriptionsTab customerId={customer.id} />}
        {activeTab === "invoices" && <InvoicesTab customerId={customer.id} />}
        {activeTab === "payments" && <PaymentsTab customerId={customer.id} />}
      </div>

      {/* Edit dialog */}
      <CustomerFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customer={customer}
      />
    </div>
  );
}
