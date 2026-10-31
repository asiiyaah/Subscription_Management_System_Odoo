import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockAccount } from "@/mocks/auth";
import { tokenStorage } from "@/lib/tokenStorage";
import type { ChangePasswordRequest, Profile, ProfileUpdate } from "@/types/settings";

/** The signed-in user's own account — any role. The backend identifies the user from the token. */

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

const myId = () => tokenStorage.getUser()?.id ?? 0;

export const accountService = {
  getProfile(): Promise<Profile> {
    return USE_MOCKS ? mockAccount.getProfile(myId()) : request(() => api.get("/api/auth/me"));
  },
  updateProfile(input: ProfileUpdate): Promise<Profile> {
    return USE_MOCKS ? mockAccount.updateProfile(myId(), input) : request(() => api.put("/api/auth/me", input));
  },
  changePassword(body: ChangePasswordRequest): Promise<{ message: string }> {
    return USE_MOCKS ? mockAccount.changePassword(myId(), body) : request(() => api.post("/api/auth/change-password", body));
  },
};
