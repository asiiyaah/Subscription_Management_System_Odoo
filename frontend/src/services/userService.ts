import { api, isLive, toApiError } from "@/services/api";
import { mockUsers } from "@/mocks/users";
import type { Id, Paginated } from "@/types/common";
import type {
  CreateTeamMemberResult,
  NewTeamMember,
  TeamCounts,
  TeamListQuery,
  TeamMember,
  UpdateTeamMember,
} from "@/types/user";

// Contract: frontend/docs/API_USERS_CONTRACT.md — backend/app/routers/users.py follows it.
// All endpoints require the admin role.
const LIVE = isLive("users");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff" | "customer";
  is_active?: boolean;
  created_at?: string | null;
  last_login?: string | null;
  invite_sent?: boolean;
  must_change_password?: boolean;
}

const fromApi = (u: ApiUser): TeamMember => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role as TeamMember["role"],
  active: u.is_active !== false,
  last_login: u.last_login ?? null,
  created_at: u.created_at ?? "",
  must_change_password: Boolean(u.must_change_password),
});

export const userService = {
  capabilities: {
    /** Email an invite link instead of setting a password. */
    invite: true,
    /** Show last login / added dates. */
    activityDates: true,
  },

  async list(query: TeamListQuery): Promise<Paginated<TeamMember>> {
    if (!LIVE) return mockUsers.list(query);
    // The backend excludes customers by default and filters by role / active; it sorts by newest first.
    const { search, page, page_size, role, active } = query;
    const data = await request<Paginated<ApiUser>>(() =>
      api.get("/api/users", { params: { q: search || undefined, role, active, page, page_size } }),
    );
    return { ...data, items: data.items.map(fromApi) };
  },

  async counts(): Promise<TeamCounts> {
    if (!LIVE) return mockUsers.counts();
    // /counts includes customers in "disabled", so count disabled team members with the list filter instead.
    const [totals, disabled] = await Promise.all([
      request<{ admin: number; staff: number }>(() => api.get("/api/users/counts")),
      request<Paginated<ApiUser>>(() => api.get("/api/users", { params: { active: false, page_size: 1 } })),
    ]);
    return { all: totals.admin + totals.staff, admin: totals.admin, staff: totals.staff, disabled: disabled.total };
  },

  async create(input: NewTeamMember): Promise<CreateTeamMemberResult> {
    if (!LIVE) return mockUsers.create(input);
    const user = await request<ApiUser>(() =>
      api.post("/api/users", {
        name: input.name,
        email: input.email,
        role: input.role,
        send_invite: input.send_invite,
        password: input.send_invite ? undefined : input.password,
      }),
    );
    const message = !input.send_invite
      ? `${user.name} can now log in with the temporary password`
      : user.invite_sent
        ? `Invite sent to ${user.email}`
        : `${user.name} was added, but the invite email couldn't be sent (email isn't set up on the server)`;
    return { user: fromApi({ ...user, is_active: user.is_active ?? true }), message };
  },

  async update(id: Id, input: UpdateTeamMember): Promise<TeamMember> {
    if (!LIVE) return mockUsers.update(id, input);
    return fromApi(await request<ApiUser>(() => api.patch(`/api/users/${id}`, input)));
  },

  async setActive(id: Id, active: boolean): Promise<TeamMember> {
    if (!LIVE) return mockUsers.setActive(id, active);
    return fromApi(await request<ApiUser>(() => api.patch(`/api/users/${id}`, { is_active: active })));
  },

  async sendPasswordReset(member: TeamMember): Promise<{ message: string; dev_reset_link?: string }> {
    if (!LIVE) return mockUsers.sendPasswordReset(member.id);
    const { message } = await request<{ message: string }>(() => api.post(`/api/users/${member.id}/password-reset`));
    return { message };
  },
};
