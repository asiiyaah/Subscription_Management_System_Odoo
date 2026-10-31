import type { ListQuery } from "@/types/common";

export type DiscountType = "percentage" | "fixed";

/** Set by the backend (R33): stops applying when expired or used up. */
export type DiscountStatus = "active" | "scheduled" | "expired" | "used_up" | "inactive";

export interface Discount {
  id: number;
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
  product_ids: number[];
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
  product_ids: number[];
}

export type DiscountValidationResult =
  | { valid: true; discount: Pick<Discount, "id" | "code" | "name" | "type" | "value" | "applies_to" | "product_ids"> }
  | { valid: false; reason: string };
