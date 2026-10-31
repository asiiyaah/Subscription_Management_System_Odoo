import { api, isLive, toApiError } from "@/services/api";
import { mockAccount } from "@/mocks/auth";
import { tokenStorage } from "@/lib/tokenStorage";
import type { ChangePasswordRequest, Profile, ProfileUpdate } from "@/types/settings";

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
}

const fromApi = (p: ApiProfile): Profile => ({
  id: p.id,
  name: p.name,
  email: p.email,
  phone: p.phone ?? undefined,
  company: p.company ?? undefined,
});

export const accountService = {
  capabilities: {
    /** Staff phone numbers (live: only customers have a phone field). */
    staffPhone: !LIVE,
    /** Customer billing address (live: not stored yet). */
    billingAddress: !LIVE,
    /** Live: changing the password invalidates the current login, so the user signs in again. */
    passwordChangeEndsSession: LIVE,
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
      api.patch(profileUrl(), { name: input.name, email: current.email, phone: input.phone ?? null, company: input.company ?? null }),
    );
    return { ...fromApi(saved), phone: saved.phone ?? input.phone, company: saved.company ?? input.company };
  },

  async changePassword(body: ChangePasswordRequest): Promise<{ message: string }> {
    if (!LIVE) return mockAccount.changePassword(me()?.id ?? 0, body);
    return request(() => api.post("/api/auth/change-password", body));
  },
};
