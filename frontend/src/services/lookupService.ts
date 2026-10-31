import { api, isLive, toApiError } from "@/services/api";
import { mockLookups } from "@/mocks/pricing";
import type { ProductOption } from "@/types/common";

/** Small id/name lists for pickers. Full product management lives in the Products module. */
export const lookupService = {
  async products(): Promise<ProductOption[]> {
    if (!isLive("lookups") && !isLive("discounts")) return mockLookups.products();
    try {
      // Only active products can be targeted by discounts (backend rule).
      const { data } = await api.get<{ items: Array<{ id: string; name: string }> }>("/api/products", {
        params: { status: "active", page_size: 100 },
      });
      return data.items.map(({ id, name }) => ({ id, name }));
    } catch (error) {
      throw toApiError(error);
    }
  },
};
