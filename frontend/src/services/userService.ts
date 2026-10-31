import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockUsers } from "@/mocks/users";
import type { Paginated } from "@/types/common";
import type {
  CreateTeamMemberResult,
  NewTeamMember,
  TeamCounts,
  TeamListQuery,
  TeamMember,
  UpdateTeamMember,
} from "@/types/user";

// Endpoints are documented in frontend/docs/API_USERS_CONTRACT.md. All require the admin role.

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const userService = {
  list(query: TeamListQuery): Promise<Paginated<TeamMember>> {
    return USE_MOCKS ? mockUsers.list(query) : request(() => api.get("/api/users", { params: query }));
  },

  counts(): Promise<TeamCounts> {
    return USE_MOCKS ? mockUsers.counts() : request(() => api.get("/api/users/counts"));
  },

  create(input: NewTeamMember): Promise<CreateTeamMemberResult> {
    return USE_MOCKS ? mockUsers.create(input) : request(() => api.post("/api/users", input));
  },

  update(id: number, input: UpdateTeamMember): Promise<TeamMember> {
    return USE_MOCKS ? mockUsers.update(id, input) : request(() => api.put(`/api/users/${id}`, input));
  },

  setActive(id: number, active: boolean): Promise<TeamMember> {
    return USE_MOCKS ? mockUsers.setActive(id, active) : request(() => api.patch(`/api/users/${id}`, { active }));
  },

  sendPasswordReset(id: number): Promise<{ message: string; dev_reset_link?: string }> {
    return USE_MOCKS
      ? mockUsers.sendPasswordReset(id)
      : request(() => api.post(`/api/users/${id}/password-reset`));
  },
};
