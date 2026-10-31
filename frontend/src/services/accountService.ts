import { api, isLive, toApiError } from "@/services/api";
import { mockAccount } from "@/mocks/auth";
import { tokenStorage } from "@/lib/tokenStorage";
import type { ChangePasswordRequest, ChangePasswordResponse, Profile, ProfileUpdate } from "@/types/settings";

/**
 * The signed-in user's own account — any role. Live mapping:
 *   staff/admin → GET/PATCH /api/settings/profile · customers → GET/PATCH /api/portal/profile
 *   password    → POST /api/auth/change-password
 */
const LIVE = isLive("account");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

const me = () => tokenStorage.getUser();
const profileUrl = () => (me()?.role === "customer" ? "/api/portal/profile" : "/api/settings/profile");

interface ApiProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  billing_address?: string | null;
}

const fromApi = (p: ApiProfile): Profile => ({
  id: p.id,
  name: p.name,
  email: p.email,
  phone: p.phone ?? undefined,
  company: p.company ?? undefined,
  billing_address: p.billing_address ?? undefined,
});

export const accountService = {
  capabilities: {
    /** Staff phone numbers (live: only customers have a phone field). */
    staffPhone: !LIVE,
    /** Customer billing address. */
    billingAddress: true,
    /** The backend returns a fresh token after a password change, so the user stays signed in. */
    passwordChangeEndsSession: false,
  },

  async getProfile(): Promise<Profile> {
    if (!LIVE) return mockAccount.getProfile(me()?.id ?? 0);
    return fromApi(await request<ApiProfile>(() => api.get(profileUrl())));
  },

  async updateProfile(input: ProfileUpdate): Promise<Profile> {
    if (!LIVE) return mockAccount.updateProfile(me()?.id ?? 0, input);
    // The backend's profile update also takes the email (unchanged here — it's the login).
    const current = await request<ApiProfile>(() => api.get(profileUrl()));
    const saved = await request<ApiProfile>(() =>
      api.patch(profileUrl(), {
        name: input.name,
        email: current.email,
        phone: input.phone ?? null,
        company: input.company ?? null,
        billing_address: input.billing_address ?? null,
      }),
    );
    return { ...fromApi(saved), phone: saved.phone ?? input.phone, company: saved.company ?? input.company };
  },

  /** Changes the password and swaps in the fresh token the server returns (old tokens stop working). */
  async changePassword(body: ChangePasswordRequest): Promise<ChangePasswordResponse> {
    const result = LIVE
      ? await request<ChangePasswordResponse>(() => api.post("/api/auth/change-password", body))
      : await mockAccount.changePassword(me()?.id ?? 0, body);
    if (result.access_token) tokenStorage.updateToken(result.access_token);
    return result;
  },
};
