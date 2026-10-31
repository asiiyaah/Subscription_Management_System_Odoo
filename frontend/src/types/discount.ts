import type { Id, ListQuery } from "@/types/common";

export type DiscountType = "percentage" | "fixed";

/** Set by the backend (R33): stops applying when expired or used up. */
export type DiscountStatus = "active" | "scheduled" | "expired" | "used_up" | "inactive";

export interface Discount {
  id: Id;
  /** Customer-facing code, uppercase, e.g. "SEATS10". Unique. */
  code: string;
  name: string;
  type: DiscountType;
  /** Percent (0–100) for "percentage", rupees for "fixed". */
  value: number;
  /** Minimum order subtotal in ₹ (R29). */
  min_purchase?: number;
  /** Minimum quantity / seats (R29). */
  min_quantity?: number;
  /** YYYY-MM-DD (R30) */
  start_date: string;
  /** YYYY-MM-DD, inclusive; omitted = no end date. */
  end_date?: string;
  /** Max number of uses; omitted = unlimited (R31). */
  usage_limit?: number;
  used_count: number;
  /** R32: whole subscription, or only lines with these products. */
  applies_to: "subscription" | "products";
  product_ids: Id[];
  /** Product names for display (backend joins them). */
  product_names: string[];
  /** Admin on/off switch. Off = "inactive" regardless of dates. */
  active: boolean;
  status: DiscountStatus;
}

/** Body for POST /api/discounts and PUT /api/discounts/{id}. */
export type DiscountInput = Omit<Discount, "id" | "used_count" | "product_names" | "status">;

export interface DiscountListQuery extends ListQuery {
  status?: DiscountStatus;
}

export type DiscountCounts = Record<DiscountStatus | "all", number>;

/** POST /api/discounts/validate — used by the subscription form (Member 1). */
export interface DiscountValidationRequest {
  code: string;
  subtotal: number;
  quantity: number;
  /** Mock only — the backend doesn't check product targeting here. */
  product_ids?: Id[];
}

export type DiscountValidationResult =
  | { valid: true; discount_id: Id; code: string; /** Calculated by the backend for this subtotal. */ discount_amount: number }
  | { valid: false; reason: string };
