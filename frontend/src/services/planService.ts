import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockPlans } from "@/mocks/plans";
import type { Paginated } from "@/types/common";
import type { Plan, PlanCreate, PlanListQuery, PlanUpdate } from "@/types/plan";

/** Plan request fields follow backend/app/routers/plans.py. */
function apiPayload(data: PlanCreate | PlanUpdate) {
  const { product_id, name, description, billing_period, billing_interval, price, trial_days, minimum_quantity, is_pausable, is_renewable, auto_close, allows_early_closure, start_date, end_date, status } = data;
  return { product_id, name, description, billing_period, billing_interval, price, trial_days, minimum_quantity, is_pausable, is_renewable, auto_close, allows_early_closure, start_date, end_date, status };
}

export const planService = {
  async list(params: PlanListQuery): Promise<Paginated<Plan>> {
    if (USE_MOCKS) return mockPlans.list(params);
    const { page, page_size, search, status, product_id } = params;
    try {
      return (await api.get<Paginated<Plan>>("/api/plans", { params: { page, page_size, q: search, status, product_id } })).data;
    } catch (error) { throw toApiError(error); }
  },
  async getById(id: string | number): Promise<Plan> {
    if (USE_MOCKS) return mockPlans.getById(id);
    try { return (await api.get<Plan>(`/api/plans/${id}`)).data; }
    catch (error) { throw toApiError(error); }
  },
  async create(data: PlanCreate): Promise<Plan> {
    if (USE_MOCKS) return mockPlans.create(data);
    try { return (await api.post<Plan>("/api/plans", apiPayload(data))).data; }
    catch (error) { throw toApiError(error); }
  },
  async update(id: string | number, data: PlanUpdate): Promise<Plan> {
    if (USE_MOCKS) return mockPlans.update(id, data);
    try { return (await api.patch<Plan>(`/api/plans/${id}`, apiPayload(data))).data; }
    catch (error) { throw toApiError(error); }
  },
  async archive(id: string | number): Promise<void> {
    if (USE_MOCKS) { await mockPlans.update(id, { status: "archived" }); return; }
    try { await api.delete(`/api/plans/${id}`); }
    catch (error) { throw toApiError(error); }
  },
  async restore(id: string | number): Promise<Plan> {
    if (USE_MOCKS) return mockPlans.update(id, { status: "active" });
    try { return (await api.patch<Plan>(`/api/plans/${id}`, { status: "active" })).data; }
    catch (error) { throw toApiError(error); }
  },
};
