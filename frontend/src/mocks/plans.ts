import { ApiError } from "@/services/api";
import { mockDelay, paginate } from "@/mocks/utils";
import type { Paginated } from "@/types/common";
import type { Plan, PlanCreate, PlanListQuery, PlanUpdate } from "@/types/plan";

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
let nextId = 9;
let plans: Plan[] = [
  { id: 1, product_id: 1, product: { id: 1, name: "SubscriptIQ Pro" }, name: "Pro Monthly", description: "Monthly access to the Pro subscription operations workspace.", billing_period: "monthly", billing_interval: 1, price: 2499, trial_days: 14, minimum_quantity: 1, is_pausable: true, is_renewable: true, auto_close: false, allows_early_closure: true, start_date: iso(-220), end_date: iso(145), status: "active", active_subscribers: 34 },
  { id: 2, product_id: 1, product: { id: 1, name: "SubscriptIQ Pro" }, name: "Pro Annual", description: "Annual Pro access with one invoice each year.", billing_period: "yearly", billing_interval: 1, price: 24990, trial_days: 0, minimum_quantity: 1, is_pausable: false, is_renewable: true, auto_close: false, allows_early_closure: false, start_date: iso(-180), end_date: null, status: "active", active_subscribers: 19 },
  { id: 3, product_id: 2, product: { id: 2, name: "Cloud Backup" }, name: "Backup 100 GB", description: "Daily backups with 100 GB of managed storage.", billing_period: "monthly", billing_interval: 1, price: 799, trial_days: 7, minimum_quantity: 1, is_pausable: true, is_renewable: true, auto_close: false, allows_early_closure: true, start_date: iso(-120), end_date: null, status: "active", active_subscribers: 42 },
  { id: 4, product_id: 2, product: { id: 2, name: "Cloud Backup" }, name: "Backup Annual", description: "Annual cloud backup subscription.", billing_period: "yearly", billing_interval: 1, price: 7990, trial_days: 14, minimum_quantity: 1, is_pausable: false, is_renewable: true, auto_close: true, allows_early_closure: true, start_date: iso(20), end_date: iso(385), status: "active", active_subscribers: 0 },
  { id: 5, product_id: 3, product: { id: 3, name: "Odoo Connector" }, name: "Connector Weekly", description: "Weekly connector plan for short-term projects.", billing_period: "weekly", billing_interval: 1, price: 399, trial_days: 0, minimum_quantity: 2, is_pausable: true, is_renewable: false, auto_close: true, allows_early_closure: false, start_date: iso(-300), end_date: iso(-10), status: "active", active_subscribers: 0 },
  { id: 6, product_id: 4, product: { id: 4, name: "Analytics Suite" }, name: "Analytics Daily", description: "Daily analytics access for a limited rollout.", billing_period: "daily", billing_interval: 1, price: 99, trial_days: 3, minimum_quantity: 1, is_pausable: true, is_renewable: true, auto_close: true, allows_early_closure: true, start_date: iso(-20), end_date: iso(10), status: "active", active_subscribers: 6 },
  { id: 7, product_id: 5, product: { id: 5, name: "Onboarding Service" }, name: "Guided Onboarding", description: "A guided onboarding engagement billed monthly.", billing_period: "monthly", billing_interval: 3, price: 9500, trial_days: 0, minimum_quantity: 1, is_pausable: false, is_renewable: false, auto_close: true, allows_early_closure: false, start_date: iso(-30), end_date: iso(60), status: "active", active_subscribers: 3 },
  { id: 8, product_id: 6, product: { id: 6, name: "Team Seats Add-on" }, name: "Extra Seats Monthly", description: "Additional team seats billed each month.", billing_period: "monthly", billing_interval: 1, price: 299, trial_days: 0, minimum_quantity: 5, is_pausable: true, is_renewable: true, auto_close: false, allows_early_closure: true, start_date: iso(-200), end_date: null, status: "archived", active_subscribers: 0 },
];
const PRODUCT_NAMES: Record<string, string> = {
  "1": "SubscriptIQ Pro", "2": "Cloud Backup", "3": "Odoo Connector", "4": "Analytics Suite",
  "5": "Onboarding Service", "6": "Team Seats Add-on", "7": "Support Desk", "8": "Secure Key Device",
};

const clone = <T,>(value: T): T => structuredClone(value);
function find(id: string | number): Plan {
  const plan = plans.find((item) => String(item.id) === String(id));
  if (!plan) throw new ApiError(404, "Plan not found.");
  return plan;
}
function availability(plan: Plan): "available" | "upcoming" | "ended" {
  const today = iso(0);
  if (plan.status === "archived" || (plan.end_date && plan.end_date < today)) return "ended";
  if (plan.start_date && plan.start_date > today) return "upcoming";
  return "available";
}

export const mockPlans = {
  async list(query: PlanListQuery): Promise<Paginated<Plan>> {
    await mockDelay();
    let rows = plans;
    if (query.availability) rows = rows.filter((plan) => availability(plan) === query.availability);
    const { availability: _availability, ...baseQuery } = query;
    void _availability;
    return paginate(rows, baseQuery, ["name", "description"]);
  },
  async getById(id: string | number): Promise<Plan> {
    await mockDelay();
    return clone(find(id));
  },
  async create(data: PlanCreate): Promise<Plan> {
    await mockDelay();
    const plan: Plan = { ...data, id: nextId++, product: { id: data.product_id, name: PRODUCT_NAMES[String(data.product_id)] ?? `Product ${data.product_id}` }, created_at: new Date().toISOString(), active_subscribers: 0 };
    plans = [...plans, plan];
    return clone(plan);
  },
  async update(id: string | number, data: PlanUpdate): Promise<Plan> {
    await mockDelay();
    find(id);
    plans = plans.map((plan) => {
      if (String(plan.id) !== String(id)) return plan;
      const next = { ...plan, ...data, updated_at: new Date().toISOString() };
      if (data.product_id !== undefined) next.product = { id: data.product_id, name: PRODUCT_NAMES[String(data.product_id)] ?? `Product ${data.product_id}` };
      return next;
    });
    return clone(find(id));
  },
};

export function getPlanAvailability(plan: Plan): "available" | "upcoming" | "ended" {
  return availability(plan);
}
