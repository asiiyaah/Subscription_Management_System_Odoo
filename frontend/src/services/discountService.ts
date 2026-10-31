import { api, isLive, num, toApiError } from "@/services/api";
import { mockDiscounts } from "@/mocks/pricing";
import type { Id, Paginated } from "@/types/common";
import type {
  Discount,
  DiscountCounts,
  DiscountInput,
  DiscountListQuery,
  DiscountValidationRequest,
  DiscountValidationResult,
} from "@/types/discount";

// Contract: frontend/docs/API_PRICING_CONTRACT.md — backend/app/routers/discounts.py follows it.
const LIVE = isLive("discounts");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Backend discount row (`_discount_dict`): the UI's fields plus legacy ones; numbers may be decimal strings. */
type ApiDiscount = Omit<Discount, "value" | "min_purchase" | "min_quantity" | "end_date" | "usage_limit"> & {
  value: string | number;
  min_purchase: number | null;
  min_quantity: number | null;
  end_date: string | null;
  usage_limit: number | null;
};

const fromApi = (d: ApiDiscount): Discount => ({
  ...d,
  code: d.code ?? "",
  value: num(d.value),
  min_purchase: d.min_purchase || undefined,
  min_quantity: d.min_quantity || undefined,
  end_date: d.end_date ?? undefined,
  usage_limit: d.usage_limit ?? undefined,
});

const toApi = (input: DiscountInput) => ({
  name: input.name,
  code: input.code,
  type: input.type,
  value: input.value,
  min_quantity: input.min_quantity ?? 0,
  min_purchase: input.min_purchase ?? 0,
  usage_limit: input.usage_limit ?? null,
  valid_from: input.start_date ? `${input.start_date}T00:00:00` : null,
  valid_until: input.end_date ? `${input.end_date}T23:59:59` : null,
  is_active: input.active,
  product_ids: input.applies_to === "products" ? input.product_ids : [],
});

export const discountService = {
  capabilities: {
    /** Real delete for never-used discounts. */
    hardDelete: true,
  },

  async list(query: DiscountListQuery): Promise<Paginated<Discount>> {
    if (!LIVE) return mockDiscounts.list(query);
    const { search, ...rest } = query;
    const page = await request<Paginated<ApiDiscount>>(() => api.get("/api/discounts", { params: { ...rest, q: search || undefined } }));
    return { ...page, items: page.items.map(fromApi) };
  },

  counts(): Promise<DiscountCounts> {
    return LIVE ? request(() => api.get("/api/discounts/counts")) : mockDiscounts.counts();
  },

  async create(input: DiscountInput): Promise<Discount> {
    if (!LIVE) return mockDiscounts.create(input);
    return fromApi(await request<ApiDiscount>(() => api.post("/api/discounts", toApi(input))));
  },

  async update(id: Id, input: DiscountInput): Promise<Discount> {
    if (!LIVE) return mockDiscounts.update(id, input);
    return fromApi(await request<ApiDiscount>(() => api.patch(`/api/discounts/${id}`, toApi(input))));
  },

  async setActive(id: Id, active: boolean): Promise<Discount> {
    if (!LIVE) return mockDiscounts.setActive(id, active);
    return fromApi(await request<ApiDiscount>(() => api.patch(`/api/discounts/${id}`, { is_active: active })));
  },

  /** Deletes a never-used discount (409 if it has been used — deactivate those instead). */
  async remove(id: Id): Promise<void> {
    if (!LIVE) return mockDiscounts.remove(id);
    await request(() => api.delete(`/api/discounts/${id}`));
  },

  /**
   * Check a code before applying it — for the subscription form (Member 1):
   *   const result = await discountService.validate({ code, subtotal, quantity, product_ids });
   *   if (!result.valid) showError(result.reason); else show result.discount_amount
   * The backend always answers 200 with `valid: true | false`.
   */
  async validate(body: DiscountValidationRequest): Promise<DiscountValidationResult> {
    if (!LIVE) return mockDiscounts.validate(body);
    const data = await request<
      | { valid: false; reason: string }
      | { valid: true; discount_id: string; discount_amount: number | string; discount: { code: string } }
    >(() => api.post("/api/discounts/validate", { ...body, code: body.code.trim(), product_ids: body.product_ids ?? [] }));
    if (!data.valid) return { valid: false, reason: data.reason };
    return { valid: true, discount_id: data.discount_id, code: data.discount.code, discount_amount: num(data.discount_amount) };
  },
};
