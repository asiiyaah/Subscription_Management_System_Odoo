// Stand-in for /api/users. Shares the user store with mocks/auth.ts, so a staff member added here
// can log in straight away, and a disabled one can't.
import { ApiError } from "@/services/api";
import { loadUsers, mockAuth, saveUsers, type MockUser } from "@/mocks/auth";
import { mockDelay, paginate } from "@/mocks/utils";
import { tokenStorage } from "@/lib/tokenStorage";
import { isPasswordValid } from "@/lib/password";
import type { Paginated } from "@/types/common";
import type {
  CreateTeamMemberResult,
  NewTeamMember,
  TeamCounts,
  TeamListQuery,
  TeamMember,
  UpdateTeamMember,
} from "@/types/user";

const SEED_DATES: Record<number, { created_at: string; last_login: string | null }> = {
  1: { created_at: "2026-01-04T09:00:00Z", last_login: null },
  2: { created_at: "2026-02-11T09:00:00Z", last_login: "2026-10-30T06:12:00Z" },
};

function toMember(u: MockUser): TeamMember {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as TeamMember["role"],
    active: u.active !== false,
    last_login: u.last_login ?? SEED_DATES[u.id]?.last_login ?? null,
    created_at: u.created_at ?? SEED_DATES[u.id]?.created_at ?? new Date().toISOString(),
  };
}

const team = () => loadUsers().filter((u) => u.role === "admin" || u.role === "staff");
/** The backend reads this from the JWT. */
const currentUserId = () => tokenStorage.getUser()?.id;

function find(id: number): MockUser {
  const user = team().find((u) => u.id === id);
  if (!user) throw new ApiError(404, "User not found.");
  return user;
}

function activeAdmins(users: MockUser[]) {
  return users.filter((u) => u.role === "admin" && u.active !== false);
}

function patch(id: number, changes: Partial<MockUser>): TeamMember {
  const users = loadUsers().map((u) => (u.id === id ? { ...u, ...changes } : u));
  saveUsers(users);
  return toMember(users.find((u) => u.id === id)!);
}

export const mockUsers = {
  async list(query: TeamListQuery): Promise<Paginated<TeamMember>> {
    await mockDelay();
    const rows = team().map(toMember);
    return paginate(rows, query, ["name", "email"]);
  },

  async counts(): Promise<TeamCounts> {
    await mockDelay(200);
    const rows = team().map(toMember);
    return {
      all: rows.length,
      admin: rows.filter((r) => r.role === "admin").length,
      staff: rows.filter((r) => r.role === "staff").length,
      disabled: rows.filter((r) => !r.active).length,
    };
  },

  async create(input: NewTeamMember): Promise<CreateTeamMemberResult> {
    await mockDelay();
    const users = loadUsers();
    const email = input.email.trim().toLowerCase();
    // R2: one account per email — across customers too.
    if (users.some((u) => u.email.toLowerCase() === email)) {
      throw new ApiError(409, "An account with this email already exists.");
    }
    if (!input.send_invite && !isPasswordValid(input.password ?? "")) {
      throw new ApiError(422, "The temporary password doesn't meet the password rules.");
    }
    const user: MockUser = {
      id: Math.max(...users.map((u) => u.id)) + 1,
      name: input.name.trim(),
      email,
      role: input.role,
      // Invited users get an unusable password until they set one from the link.
      password: input.send_invite ? crypto.randomUUID() : input.password!,
      active: true,
      last_login: null,
      created_at: new Date().toISOString(),
    };
    saveUsers([...users, user]);

    if (input.send_invite) {
      const { dev_reset_link } = await mockAuth.forgotPassword({ email });
      return { user: toMember(user), message: `Invite sent to ${email}`, dev_invite_link: dev_reset_link };
    }
    return { user: toMember(user), message: `${user.name} can now log in with the temporary password` };
  },

  async update(id: number, input: UpdateTeamMember): Promise<TeamMember> {
    await mockDelay();
    const user = find(id);
    if (id === currentUserId() && input.role !== user.role) {
      throw new ApiError(422, "You can't change your own role.");
    }
    if (user.role === "admin" && input.role !== "admin" && activeAdmins(team()).length <= 1 && user.active !== false) {
      throw new ApiError(422, "There must always be at least one active admin.");
    }
    return patch(id, { name: input.name.trim(), role: input.role });
  },

  async setActive(id: number, active: boolean): Promise<TeamMember> {
    await mockDelay(400);
    const user = find(id);
    if (!active && id === currentUserId()) throw new ApiError(422, "You can't disable your own account.");
    if (!active && user.role === "admin" && activeAdmins(team()).length <= 1) {
      throw new ApiError(422, "There must always be at least one active admin.");
    }
    return patch(id, { active });
  },

  async sendPasswordReset(id: number): Promise<{ message: string; dev_reset_link?: string }> {
    const user = find(id);
    const { dev_reset_link } = await mockAuth.forgotPassword({ email: user.email });
    return { message: `Password reset link sent to ${user.email}`, dev_reset_link };
  },
};
