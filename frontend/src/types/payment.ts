import type { ListQuery } from "@/types/common";
import type { PaymentMethod } from "@/types/invoice";

/** Row shape returned by GET /api/payments. */
export interface PaymentRow {
  id: number;
  number: string;
  payment_date: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
}

/** Filters accepted by GET /api/payments (on top of page/search/sort). */
export interface PaymentListQuery extends ListQuery {
  method?: PaymentMethod;
  /** Inclusive, YYYY-MM-DD */
  date_from?: string;
  /** Inclusive, YYYY-MM-DD */
  date_to?: string;
  customer_id?: number;
  invoice_id?: number;
}

/** GET /api/payments/summary */
export interface PaymentStats {
  collected_this_month: number;
  payments_this_month: number;
  /** Method with the most money collected this month; null if no payments yet. */
  top_method: PaymentMethod | null;
  /** Unpaid balance across confirmed invoices. */
  outstanding: number;
  /** Amount collected this month per method. */
  by_method: Array<{ method: PaymentMethod; amount: number; count: number }>;
}
