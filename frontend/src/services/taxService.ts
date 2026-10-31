import { api, isLive, num, toApiError } from "@/services/api";
import { mockTaxes } from "@/mocks/pricing";
import type { Id } from "@/types/common";
import type { TaxInput, TaxRule } from "@/types/tax";

// Endpoints: frontend/docs/API_PRICING_CONTRACT.md (mock) — live mapping below follows backend/app/routers/taxes.py.
const LIVE = isLive("taxes");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Backend tax row → UI tax rule. The backend has no per-rule product targeting (it's set per product). */
interface ApiTax {
  id: string;
  name: string;
  tax_type: "percentage" | "fixed";
  rate: string;
  is_active: boolean | null;
  is_default: boolean;
}

function fromApi(t: ApiTax): TaxRule {
  return {
    id: t.id,
    name: t.name,
    type: t.tax_type,
    rate: num(t.rate),
    applies_to: "all",
    product_ids: [],
    product_names: [],
    is_default: t.is_default,
    active: t.is_active !== false,
  };
}

const toApi = (input: TaxInput) => ({
  name: input.name,
  tax_type: input.type,
  rate: input.rate,
  is_active: input.is_default ? true : input.active,
  is_default: input.is_default,
});

export const taxService = {
  /** What the connected API supports — the UI hides what isn't there. */
  capabilities: {
    /** Pick specific products on the rule itself (live: set per product instead). */
    productTargeting: !LIVE,
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
    return fromApi(await request<ApiTax>(() => api.patch(`/api/taxes/${id}`, { is_default: true, is_active: true })));
  },

  async setActive(id: Id, active: boolean): Promise<TaxRule> {
    if (!LIVE) return mockTaxes.setActive(id, active);
    return fromApi(await request<ApiTax>(() => api.patch(`/api/taxes/${id}`, { is_active: active })));
  },

  /** Mock: deletes. Live: the backend deactivates instead (history is kept). */
  async remove(id: Id): Promise<void> {
    if (!LIVE) return mockTaxes.remove(id);
    await request(() => api.delete(`/api/taxes/${id}`));
  },
};
