import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockTaxes } from "@/mocks/pricing";
import type { TaxInput, TaxRule } from "@/types/tax";

// Endpoints are documented in frontend/docs/API_PRICING_CONTRACT.md.

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const taxService = {
  /** Tax rules are few, so the list isn't paginated. Default first. */
  list(): Promise<TaxRule[]> {
    return USE_MOCKS ? mockTaxes.list() : request(() => api.get("/api/taxes"));
  },

  create(input: TaxInput): Promise<TaxRule> {
    return USE_MOCKS ? mockTaxes.create(input) : request(() => api.post("/api/taxes", input));
  },

  update(id: number, input: TaxInput): Promise<TaxRule> {
    return USE_MOCKS ? mockTaxes.update(id, input) : request(() => api.put(`/api/taxes/${id}`, input));
  },

  setDefault(id: number): Promise<TaxRule> {
    return USE_MOCKS ? mockTaxes.setDefault(id) : request(() => api.post(`/api/taxes/${id}/default`));
  },

  setActive(id: number, active: boolean): Promise<TaxRule> {
    return USE_MOCKS ? mockTaxes.setActive(id, active) : request(() => api.patch(`/api/taxes/${id}`, { active }));
  },

  remove(id: number): Promise<void> {
    return USE_MOCKS ? mockTaxes.remove(id) : request(() => api.delete(`/api/taxes/${id}`));
  },
};
