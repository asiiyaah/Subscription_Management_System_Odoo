import type { ListQuery } from "@/types/common";

export type BillingPeriod = "daily" | "weekly" | "monthly" | "yearly";
export type PlanStatus = "active" | "archived";
export type PlanAvailability = "available" | "upcoming" | "ended";

export interface PlanProductSummary {
  id: string | number;
  name: string;
}

/** Fields backed by backend/app/models/plan.py; product is a related summary. */
export interface Plan {
  id: string | number;
  product_id: string | number;
  product?: PlanProductSummary;
  name: string;
  description?: string | null;
  billing_period: BillingPeriod;
  billing_interval: number | null;
  price: number | string;
  trial_days: number | null;
  minimum_quantity: number;
  is_pausable: boolean | null;
  is_renewable: boolean | null;
  auto_close: boolean;
  allows_early_closure: boolean;
  start_date?: string | null;
  end_date?: string | null;
  status: PlanStatus;
  created_at?: string;
  updated_at?: string;
  /** Optional related-data aggregate returned by an API, when available. */
  active_subscribers?: number;
}

export interface PlanCreate {
  product_id: string | number;
  name: string;
  description?: string;
  billing_period: BillingPeriod;
  billing_interval: number;
  price: number;
  trial_days: number;
  is_pausable: boolean;
  is_renewable: boolean;
  start_date?: string;
  end_date?: string;
  status: PlanStatus;
  minimum_quantity: number;
  auto_close: boolean;
  allows_early_closure: boolean;
}

export type PlanUpdate = Partial<PlanCreate>;

export interface PlanListQuery extends ListQuery {
  product_id?: string | number;
  billing_period?: BillingPeriod;
  availability?: PlanAvailability;
  status?: PlanStatus;
}
