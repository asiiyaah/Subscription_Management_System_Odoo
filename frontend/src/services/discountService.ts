import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockDiscounts } from "@/mocks/pricing";
import type { Paginated } from "@/types/common";
import type {
  Discount,
  DiscountCounts,
  DiscountInput,
  DiscountListQuery,
  DiscountValidationRequest,
  DiscountValidationResult,
} from "@/types/discount";

// Endpoints are documented in frontend/docs/API_PRICING_CONTRACT.md.

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const discountService = {
  list(query: DiscountListQuery): Promise<Paginated<Discount>> {
    return USE_MOCKS ? mockDiscounts.list(query) : request(() => api.get("/api/discounts", { params: query }));
  },

  counts(): Promise<DiscountCounts> {
    return USE_MOCKS ? mockDiscounts.counts() : request(() => api.get("/api/discounts/counts"));
  },

  create(input: DiscountInput): Promise<Discount> {
    return USE_MOCKS ? mockDiscounts.create(input) : request(() => api.post("/api/discounts", input));
  },

  update(id: number, input: DiscountInput): Promise<Discount> {
    return USE_MOCKS ? mockDiscounts.update(id, input) : request(() => api.put(`/api/discounts/${id}`, input));
  },

  setActive(id: number, active: boolean): Promise<Discount> {
    return USE_MOCKS
      ? mockDiscounts.setActive(id, active)
      : request(() => api.patch(`/api/discounts/${id}`, { active }));
  },

  remove(id: number): Promise<void> {
    return USE_MOCKS ? mockDiscounts.remove(id) : request(() => api.delete(`/api/discounts/${id}`));
  },

  /**
   * Check a code before applying it — for the subscription form (Member 1):
   *   const result = await discountService.validate({ code, subtotal, quantity, product_ids });
   *   if (!result.valid) showError(result.reason);
   * The discount amount itself is calculated by the backend preview, not here.
   */
  validate(body: DiscountValidationRequest): Promise<DiscountValidationResult> {
    return USE_MOCKS ? mockDiscounts.validate(body) : request(() => api.post("/api/discounts/validate", body));
  },
};
