import type { Id, ListQuery } from "@/types/common";

/** Internal team member (R5). Customers are managed in the Customers module, not here. */
export type TeamRole = "admin" | "staff";

export interface TeamMember {
  id: Id;
  name: string;
  email: string;
  role: TeamRole;
  active: boolean;
  last_login: string | null;
  /** Empty when the backend doesn't send it. */
  created_at: string;
}

export interface TeamListQuery extends ListQuery {
  role?: TeamRole;
  /** "true" = active only, "false" = disabled only */
  active?: "true" | "false";
}

export type TeamCounts = { all: number; admin: number; staff: number; disabled: number };

/** POST /api/users — only an admin can add a member of staff (R7). */
export interface NewTeamMember {
  name: string;
  email: string;
  role: TeamRole;
  /** true = email an invite link to set a password; false = use `password`. */
  send_invite: boolean;
  /** Required when send_invite is false; must pass the password rules (R3). */
  password?: string;
}

export interface UpdateTeamMember {
  name: string;
  role: TeamRole;
}

export interface CreateTeamMemberResult {
  user: TeamMember;
  message: string;
  /** Mock mode only: invite link to open without real email. */
  dev_invite_link?: string;
}
