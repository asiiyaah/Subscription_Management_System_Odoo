import { api, isLive, num, toApiError } from "@/services/api";
import { mockTaxes } from "@/mocks/pricing";
import type { Id } from "@/types/common";
import type { TaxInput, TaxRule } from "@/types/tax";

// Contract: frontend/docs/API_PRICING_CONTRACT.md — backend/app/routers/taxes.py follows it.
const LIVE = isLive("taxes");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Backend tax row (routers/taxes.py `_tax_dict`) — already in the UI's shape, plus legacy fields. */
interface ApiTax {
  id: string;
  name: string;
  type: "percentage" | "fixed";
  rate: string | number;
  active: boolean;
  is_default: boolean;
  applies_to: "all" | "products";
  product_ids: string[];
  product_names: string[];
}

const fromApi = (t: ApiTax): TaxRule => ({
  id: t.id,
  name: t.name,
  type: t.type,
  rate: num(t.rate),
  applies_to: t.applies_to,
  product_ids: t.product_ids,
  product_names: t.product_names,
  is_default: t.is_default,
  active: t.active,
});

const toApi = (input: TaxInput) => ({
  name: input.name,
  type: input.type,
  rate: input.rate,
  active: input.is_default ? true : input.active,
  is_default: input.is_default,
  applies_to: input.applies_to,
  product_ids: input.applies_to === "products" ? input.product_ids : [],
});

export const taxService = {
  /** What the connected API supports — the UI hides what isn't there. */
  capabilities: {
    /** Pick specific products on the rule itself. */
    productTargeting: true,
    /** Real delete (live: DELETE only deactivates). */
    hardDelete: !LIVE,
  },

  /** Tax rules are few, so the list isn't paginated. Default first. */
  async list(): Promise<TaxRule[]> {
    if (!LIVE) return mockTaxes.list();
    const page = await request<{ items: ApiTax[] }>(() => api.get("/api/taxes", { params: { page_size: 200 } }));
    return page.items.map(fromApi).sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
  },

  async create(input: TaxInput): Promise<TaxRule> {
    if (!LIVE) return mockTaxes.create(input);
    return fromApi(await request<ApiTax>(() => api.post("/api/taxes", toApi(input))));
  },

  async update(id: Id, input: TaxInput): Promise<TaxRule> {
    if (!LIVE) return mockTaxes.update(id, input);
    return fromApi(await request<ApiTax>(() => api.patch(`/api/taxes/${id}`, toApi(input))));
  },

  async setDefault(id: Id): Promise<TaxRule> {
    if (!LIVE) return mockTaxes.setDefault(id);
    return fromApi(await request<ApiTax>(() => api.post(`/api/taxes/${id}/default`)));
  },

  async setActive(id: Id, active: boolean): Promise<TaxRule> {
    if (!LIVE) return mockTaxes.setActive(id, active);
    return fromApi(await request<ApiTax>(() => api.patch(`/api/taxes/${id}`, { active })));
  },

  /** Mock: deletes. Live: the backend deactivates instead (history is kept). */
  async remove(id: Id): Promise<void> {
    if (!LIVE) return mockTaxes.remove(id);
    await request(() => api.delete(`/api/taxes/${id}`));
  },
};
