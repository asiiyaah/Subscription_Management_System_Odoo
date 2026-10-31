import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockLookups } from "@/mocks/pricing";
import type { ProductOption } from "@/types/common";

/** Small id/name lists for pickers. Full product management lives in the Products module. */
export const lookupService = {
  async products(): Promise<ProductOption[]> {
    if (USE_MOCKS) return mockLookups.products();
    try {
      return (await api.get<ProductOption[]>("/api/products/options")).data;
    } catch (error) {
      throw toApiError(error);
    }
  },
};
