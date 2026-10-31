import { api, isLive, num, toApiError } from "@/services/api";
import { mockDiscounts } from "@/mocks/pricing";
import { paginate } from "@/mocks/utils";
import { lookupService } from "@/services/lookupService";
import { toIsoDate } from "@/lib/format";
import type { Id, Paginated } from "@/types/common";
import type {
  Discount,
  DiscountCounts,
  DiscountInput,
  DiscountListQuery,
  DiscountStatus,
  DiscountValidationRequest,
  DiscountValidationResult,
} from "@/types/discount";

// Mock contract: frontend/docs/API_PRICING_CONTRACT.md. Live mapping follows backend/app/routers/discounts.py.
const LIVE = isLive("discounts");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

interface ApiDiscount {
  id: string;
  name: string;
  code: string | null;
  discount_type: "percentage" | "fixed";
  value: string;
  minimum_quantity: number | null;
  minimum_purchase: string | null;
  usage_limit: number | null;
  usage_count: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean | null;
  product_ids: string[];
}

/** Same order the backend uses when it applies discounts. */
function statusOf(d: Omit<Discount, "status">): DiscountStatus {
  const today = toIsoDate();
  if (!d.active) return "inactive";
  if (d.usage_limit !== undefined && d.used_count >= d.usage_limit) return "used_up";
  if (d.end_date && d.end_date < today) return "expired";
  if (d.start_date && d.start_date > today) return "scheduled";
  return "active";
}

function fromApi(d: ApiDiscount, productNames: Map<Id, string>): Discount {
  const base = {
    id: d.id,
    code: d.code ?? "",
    name: d.name,
    type: d.discount_type,
    value: num(d.value),
    min_purchase: num(d.minimum_purchase) || undefined,
    min_quantity: d.minimum_quantity || undefined,
    start_date: d.valid_from?.slice(0, 10) ?? "",
    end_date: d.valid_until?.slice(0, 10) || undefined,
    usage_limit: d.usage_limit ?? undefined,
    used_count: d.usage_count ?? 0,
    applies_to: d.product_ids.length ? ("products" as const) : ("subscription" as const),
    product_ids: d.product_ids,
    product_names: d.product_ids.map((id) => productNames.get(id) ?? "Unknown product"),
    active: d.is_active !== false,
  };
  return { ...base, status: statusOf(base) };
}

const toApi = (input: DiscountInput) => ({
  name: input.name,
  code: input.code,
  discount_type: input.type,
  value: input.value,
  minimum_quantity: input.min_quantity ?? 0,
  minimum_purchase: input.min_purchase ?? 0,
  usage_limit: input.usage_limit ?? null,
  valid_from: input.start_date ? `${input.start_date}T00:00:00` : null,
  valid_until: input.end_date ? `${input.end_date}T23:59:59` : null,
  is_active: input.active,
  product_ids: input.applies_to === "products" ? input.product_ids : [],
});

/**
 * The backend has no status filter, code search or counts, so in live mode we load all discounts
 * (there are few — max 100) and filter, sort and count them here.
 */
async function loadAll(): Promise<Discount[]> {
  const [page, products] = await Promise.all([
    request<{ items: ApiDiscount[] }>(() => api.get("/api/discounts", { params: { page_size: 100 } })),
    lookupService.products().catch(() => []),
  ]);
  const names = new Map<Id, string>(products.map((p) => [p.id, p.name]));
  return page.items.map((d) => fromApi(d, names));
}

export const discountService = {
  capabilities: {
    /** Real delete for never-used discounts (live: DELETE only deactivates). */
    hardDelete: !LIVE,
  },

  async list(query: DiscountListQuery): Promise<Paginated<Discount>> {
    if (!LIVE) return mockDiscounts.list(query);
    return paginate(await loadAll(), query, ["code", "name"]);
  },

  async counts(): Promise<DiscountCounts> {
    if (!LIVE) return mockDiscounts.counts();
    const rows = await loadAll();
    const count = (status: DiscountStatus) => rows.filter((d) => d.status === status).length;
    return {
      all: rows.length,
      active: count("active"),
      scheduled: count("scheduled"),
      expired: count("expired"),
      used_up: count("used_up"),
      inactive: count("inactive"),
    };
  },

  async create(input: DiscountInput): Promise<Discount> {
    if (!LIVE) return mockDiscounts.create(input);
    const saved = await request<ApiDiscount>(() => api.post("/api/discounts", toApi(input)));
    return fromApi(saved, new Map());
  },

  async update(id: Id, input: DiscountInput): Promise<Discount> {
    if (!LIVE) return mockDiscounts.update(id, input);
    const saved = await request<ApiDiscount>(() => api.patch(`/api/discounts/${id}`, toApi(input)));
    return fromApi(saved, new Map());
  },

  async setActive(id: Id, active: boolean): Promise<Discount> {
    if (!LIVE) return mockDiscounts.setActive(id, active);
    const saved = await request<ApiDiscount>(() => api.patch(`/api/discounts/${id}`, { is_active: active }));
    return fromApi(saved, new Map());
  },

  /** Mock: deletes a never-used discount. Live: the backend deactivates it. */
  async remove(id: Id): Promise<void> {
    if (!LIVE) return mockDiscounts.remove(id);
    await request(() => api.delete(`/api/discounts/${id}`));
  },

  /**
   * Check a code before applying it — for the subscription form (Member 1):
   *   const result = await discountService.validate({ code, subtotal, quantity });
   *   if (!result.valid) showError(result.reason); else show result.discount_amount
   */
  async validate(body: DiscountValidationRequest): Promise<DiscountValidationResult> {
    if (!LIVE) return mockDiscounts.validate(body);
    try {
      // The backend takes these as query parameters and answers 422 with the reason when the code can't be used.
      const { data } = await api.post<{ valid: true; discount_id: string; discount_amount: string }>("/api/discounts/validate", null, {
        params: { code: body.code.trim(), subtotal: body.subtotal, quantity: body.quantity },
      });
      return { valid: true, discount_id: data.discount_id, code: body.code.trim().toUpperCase(), discount_amount: num(data.discount_amount) };
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.status === 422) return { valid: false, reason: apiError.message };
      throw apiError;
    }
  },
};
