import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Mail, MailCheck } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useListQuery } from "@/hooks/useListQuery";
import { useToast } from "@/components/ui/Toast";
import { customerService } from "@/services/customerService";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { Customer } from "@/types/customer";

const PORTAL_STATUS_OPTIONS = [
  { value: "true", label: "Portal active" },
  { value: "false", label: "No portal" },
];

export default function Customers() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListQuery({ sortBy: "name", sortDir: "asc" });

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | undefined>(undefined);
  const [inviteTarget, setInviteTarget] = useState<Customer | undefined>(undefined);

  const { data, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: ["customers", list.query],
    queryFn: () => customerService.list(list.query),
  });

  const inviteMutation = useMutation({
    mutationFn: (id: number) => customerService.inviteToPortal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Portal invitation sent successfully.");
      setInviteTarget(undefined);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to send invitation.");
      setInviteTarget(undefined);
    },
  });

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-sm font-bold text-primary ring-1 ring-primary/20">
            {row.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-muted">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      render: (row) => row.phone ?? <span className="text-muted">—</span>,
    },
    {
      key: "company",
      header: "Company",
      render: (row) =>
        row.company ? (
          <span className="truncate">{row.company}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "active_subscriptions",
      header: "Subscriptions",
      align: "right",
      sortable: true,
      render: (row) => (
        <span className={row.active_subscriptions > 0 ? "font-medium text-ink" : "text-muted"}>
          {row.active_subscriptions}
        </span>
      ),
    },
    {
      key: "outstanding_amount",
      header: "Outstanding",
      align: "right",
      sortable: true,
      render: (row) => (
        <span className={row.outstanding_amount > 0 ? "font-semibold text-danger" : "text-muted"}>
          {row.outstanding_amount > 0 ? formatCurrency(row.outstanding_amount) : "—"}
        </span>
      ),
    },
    {
      key: "portal_access",
      header: "Portal",
      render: (row) =>
        row.portal_access ? (
          <StatusBadge status="active" className="text-xs" />
        ) : (
          <StatusBadge status="inactive" className="text-xs" />
        ),
    },
    {
      key: "created_at",
      header: "Since",
      sortable: true,
      render: (row) => <span className="text-muted">{formatDate(row.created_at)}</span>,
    },
  ];

  function openCreate() {
    setEditTarget(undefined);
    setFormOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditTarget(customer);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage your customer accounts and portal access."
        actions={
          <Button onClick={openCreate}>
            <UserPlus className="size-4" aria-hidden />
            New Customer
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        errorMessage={error instanceof ApiError ? error.message : "Could not load customers."}
        onRetry={refetch}
        list={list}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/customers/${row.id}`)}
        searchPlaceholder="Search by name, email, company…"
        filters={
          <Select
            aria-label="Filter by portal status"
            options={PORTAL_STATUS_OPTIONS}
            placeholder="All statuses"
            value={String(list.query.portal_access ?? "")}
            onChange={(e) =>
              list.setFilter("portal_access", e.target.value || undefined)
            }
            className="w-44"
          />
        }
        empty={{
          title: "No customers yet",
          description: "Add your first customer to get started.",
          action: (
            <Button onClick={openCreate}>
              <UserPlus className="size-4" aria-hidden />
              New Customer
            </Button>
          ),
        }}
        rowActions={(row) => [
          {
            label: "View details",
            icon: <Users className="size-4" />,
            onSelect: () => navigate(`/customers/${row.id}`),
          },
          {
            label: "Edit",
            icon: <Mail className="size-4" />,
            onSelect: () => openEdit(row),
          },
          ...(row.portal_access
            ? []
            : [
                {
                  label: "Invite to portal",
                  icon: <MailCheck className="size-4" />,
                  onSelect: () => setInviteTarget(row),
                },
              ]),
        ]}
      />

      {/* Create / Edit dialog */}
      <CustomerFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customer={editTarget}
      />

      {/* Invite to portal confirmation */}
      <ConfirmDialog
        open={Boolean(inviteTarget)}
        onClose={() => setInviteTarget(undefined)}
        onConfirm={() => inviteTarget && inviteMutation.mutate(inviteTarget.id)}
        loading={inviteMutation.isPending}
        title="Send portal invitation?"
        description={`An invitation will be sent to ${inviteTarget?.email}. They can then set a password and access their subscriptions.`}
        confirmLabel="Send invitation"
      />
    </div>
  );
}
