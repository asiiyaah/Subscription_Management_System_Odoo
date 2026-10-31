import { api, isLive, toApiError } from "@/services/api";
import { mockUsers } from "@/mocks/users";
import { paginate } from "@/mocks/utils";
import type { Id, Paginated } from "@/types/common";
import type {
  CreateTeamMemberResult,
  NewTeamMember,
  TeamCounts,
  TeamListQuery,
  TeamMember,
  UpdateTeamMember,
} from "@/types/user";

// Mock contract: frontend/docs/API_USERS_CONTRACT.md. Live mapping follows backend/app/routers/users.py.
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
}

/** The backend doesn't send last login or created date yet. */
const fromApi = (u: ApiUser): TeamMember => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role as TeamMember["role"],
  active: u.is_active !== false,
  last_login: null,
  created_at: "",
});

/**
 * The backend lists every account (customers too) without an active filter or counts, so in live mode
 * we load the team (max 100) and filter, sort and count it here.
 */
async function loadTeam(): Promise<TeamMember[]> {
  const page = await request<{ items: ApiUser[] }>(() => api.get("/api/users", { params: { page_size: 100 } }));
  return page.items.filter((u) => u.role === "admin" || u.role === "staff").map(fromApi);
}

export const userService = {
  capabilities: {
    /** Email an invite link instead of setting a password (live: password required). */
    invite: !LIVE,
    /** Show last login / added dates. */
    activityDates: !LIVE,
  },

  async list(query: TeamListQuery): Promise<Paginated<TeamMember>> {
    if (!LIVE) return mockUsers.list(query);
    return paginate(await loadTeam(), query, ["name", "email"]);
  },

  async counts(): Promise<TeamCounts> {
    if (!LIVE) return mockUsers.counts();
    const rows = await loadTeam();
    return {
      all: rows.length,
      admin: rows.filter((r) => r.role === "admin").length,
      staff: rows.filter((r) => r.role === "staff").length,
      disabled: rows.filter((r) => !r.active).length,
    };
  },

  async create(input: NewTeamMember): Promise<CreateTeamMemberResult> {
    if (!LIVE) return mockUsers.create(input);
    const user = await request<ApiUser>(() =>
      api.post("/api/users", { name: input.name, email: input.email, role: input.role, password: input.password }),
    );
    return { user: fromApi({ ...user, is_active: true }), message: `${user.name} can now log in with the temporary password` };
  },

  async update(id: Id, input: UpdateTeamMember): Promise<TeamMember> {
    if (!LIVE) return mockUsers.update(id, input);
    return fromApi(await request<ApiUser>(() => api.patch(`/api/users/${id}`, input)));
  },

  async setActive(id: Id, active: boolean): Promise<TeamMember> {
    if (!LIVE) return mockUsers.setActive(id, active);
    return fromApi(await request<ApiUser>(() => api.patch(`/api/users/${id}`, { is_active: active })));
  },

  /** Live: uses the normal forgot-password email, which works for any active account. */
  async sendPasswordReset(member: TeamMember): Promise<{ message: string; dev_reset_link?: string }> {
    if (!LIVE) return mockUsers.sendPasswordReset(member.id);
    await request(() => api.post("/api/auth/forgot-password", { email: member.email }));
    return { message: `Password reset link sent to ${member.email}` };
  },
};
