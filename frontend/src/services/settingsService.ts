import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockSettings } from "@/mocks/settings";
import type { AutomationSettings, BusinessSettings } from "@/types/settings";

// Endpoints are documented in frontend/docs/API_SETTINGS_PORTAL_CONTRACT.md.

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const settingsService = {
  /** Readable by every signed-in user (invoices print the seller details). */
  getBusiness(): Promise<BusinessSettings> {
    return USE_MOCKS ? mockSettings.getBusiness() : request(() => api.get("/api/settings/business"));
  },
  /** Admin only. */
  updateBusiness(input: BusinessSettings): Promise<BusinessSettings> {
    return USE_MOCKS ? mockSettings.updateBusiness(input) : request(() => api.put("/api/settings/business", input));
  },
  /** Admin only. */
  getAutomation(): Promise<AutomationSettings> {
    return USE_MOCKS ? mockSettings.getAutomation() : request(() => api.get("/api/settings/automation"));
  },
  /** Admin only. */
  updateAutomation(input: AutomationSettings): Promise<AutomationSettings> {
    return USE_MOCKS ? mockSettings.updateAutomation(input) : request(() => api.put("/api/settings/automation", input));
  },
};
