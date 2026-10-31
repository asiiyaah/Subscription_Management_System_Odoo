import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Minus, Pencil, Power, PowerOff, ShieldCheck, UserPlus, Users as UsersIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Tabs } from "@/components/common/Tabs";
import { AddStaffDialog } from "@/components/users/AddStaffDialog";
import { EditMemberDialog } from "@/components/users/EditMemberDialog";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { MenuAction } from "@/components/ui/DropdownMenu";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { useListQuery } from "@/hooks/useListQuery";
import { cn } from "@/lib/cn";
import { formatDate, formatRelativeDays } from "@/lib/format";
import { userService } from "@/services/userService";
import type { ApiError } from "@/services/api";
import type { TeamListQuery, TeamMember } from "@/types/user";

/** What each role can do (R5) — shown on the page so admins know what they're granting. */
const PERMISSIONS: Array<{ area: string; admin: boolean; staff: boolean | "view" }> = [
  { area: "Customers, subscriptions, invoices, payments", admin: true, staff: true },
  { area: "Reports and AI assistant (ask questions)", admin: true, staff: true },
  { area: "Discounts", admin: true, staff: "view" },
  { area: "Taxes", admin: true, staff: false },
  { area: "Approve AI actions (reminders, invoices)", admin: true, staff: false },
  { area: "Add and manage staff", admin: true, staff: false },
];

type Pending = { member: TeamMember; active: boolean } | null;

/** Users & Staff (R5, R7). Admin only — the route is guarded in ./routes.tsx. */
export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListQuery({ sortBy: "name" });
  const query = list.query as TeamListQuery;

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const users = useQuery({
    queryKey: ["users", "list", query],
    queryFn: () => userService.list(query),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({ queryKey: ["users", "counts"], queryFn: () => userService.counts() });

  const activeMutation = useMutation<TeamMember, ApiError, { member: TeamMember; active: boolean }>({
    mutationFn: ({ member, active }) => userService.setActive(member.id, active),
    onSuccess: (saved) => {
      toast.success(saved.active ? `${saved.name} can log in again` : `${saved.name} can no longer log in`);
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const resetMutation = useMutation<{ message: string }, ApiError, TeamMember>({
    mutationFn: (member) => userService.sendPasswordReset(member.id),
    onSuccess: ({ message }) => toast.success(message),
    onError: (error) => toast.error(error.message),
  });

  const columns: Column<TeamMember>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
              u.active ? "bg-gradient-to-br from-primary to-accent" : "bg-surface-2 text-muted",
            )}
            aria-hidden
          >
            {u.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">
              {u.name}
              {u.id === me?.id && <span className="ml-2 rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">You</span>}
            </p>
            <p className="text-xs text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (u) =>
        u.role === "admin" ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" aria-hidden /> Admin
          </span>
        ) : (
          <span className="text-sm text-muted">Staff</span>
        ),
    },
    { key: "active", header: "Status", render: (u) => <StatusBadge status={u.active ? "active" : "inactive"} /> },
    {
      key: "last_login",
      header: "Last login",
      sortable: true,
      render: (u) => (u.last_login ? <span title={formatDate(u.last_login)}>{formatRelativeDays(u.last_login)}</span> : <span className="text-muted">Never</span>),
    },
    { key: "created_at", header: "Added", sortable: true, render: (u) => formatDate(u.created_at) },
  ];

  function menuFor(u: TeamMember): MenuAction[] {
    const isSelf = u.id === me?.id;
    const items: Array<MenuAction | false> = [
      { label: "Edit", icon: <Pencil />, onSelect: () => setEditing(u) },
      u.active && { label: "Send password reset", icon: <KeyRound />, onSelect: () => resetMutation.mutate(u) },
      !isSelf &&
        (u.active
          ? { label: "Disable access", icon: <PowerOff />, tone: "danger", onSelect: () => setPending({ member: u, active: false }) }
          : { label: "Enable access", icon: <Power />, onSelect: () => activeMutation.mutate({ member: u, active: true }) }),
    ];
    return items.filter((item): item is MenuAction => item !== false);
  }

  const activeTab = query.active === "false" ? "disabled" : (query.role ?? "");
  function changeTab(tab: string) {
    if (tab === "disabled") list.setFilters({ active: "false", role: undefined });
    else list.setFilters({ role: tab || undefined, active: undefined });
  }
  const c = counts.data;

  return (
    <>
      <PageHeader
        title="Users & staff"
        description="Your internal team. Customers sign up themselves and are managed under Customers."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus aria-hidden /> Add staff member
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Tabs
            aria-label="Filter team members"
            value={activeTab}
            onChange={changeTab}
            tabs={[
              { value: "", label: "All", count: c?.all },
              { value: "admin", label: "Admins", count: c?.admin },
              { value: "staff", label: "Staff", count: c?.staff },
              { value: "disabled", label: "Disabled", count: c?.disabled },
            ]}
          />
          <DataTable
            columns={columns}
            data={users.data}
            isLoading={users.isPending}
            isFetching={users.isFetching}
            isError={users.isError}
            errorMessage={users.error?.message}
            onRetry={() => users.refetch()}
            list={list}
            rowKey={(u) => u.id}
            onRowClick={(u) => setEditing(u)}
            rowActions={menuFor}
            searchPlaceholder="Search name or email…"
            empty={{
              icon: <UsersIcon />,
              title: "No team members yet",
              action: (
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <UserPlus aria-hidden /> Add staff member
                </Button>
              ),
            }}
          />
        </div>

        <section className="h-fit rounded-2xl border border-line bg-surface/70 p-5">
          <h2 className="font-semibold">What each role can do</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="pb-2 text-left font-medium">Area</th>
                <th scope="col" className="w-14 pb-2 text-center font-medium">Admin</th>
                <th scope="col" className="w-14 pb-2 text-center font-medium">Staff</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((row) => (
                <tr key={row.area} className="border-t border-line/60">
                  <td className="py-2 pr-2 text-xs">{row.area}</td>
                  <td className="py-2 text-center">
                    <Allowed value={row.admin} />
                  </td>
                  <td className="py-2 text-center">
                    <Allowed value={row.staff} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <AddStaffDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <EditMemberDialog member={editing} isSelf={editing?.id === me?.id} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && activeMutation.mutate(pending)}
        loading={activeMutation.isPending}
        tone="danger"
        title={`Disable ${pending?.member.name ?? ""}?`}
        description="They'll be signed out and won't be able to log in. Their past work stays. You can enable them again any time."
        confirmLabel="Disable access"
      />
    </>
  );
}

function Allowed({ value }: { value: boolean | "view" }) {
  if (value === "view") return <span className="text-[11px] font-medium text-muted">View</span>;
  return value ? (
    <Check className="mx-auto size-4 text-success" aria-label="Allowed" />
  ) : (
    <Minus className="mx-auto size-4 text-muted/50" aria-label="Not allowed" />
  );
}
