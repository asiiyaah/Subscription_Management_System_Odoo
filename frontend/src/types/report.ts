import type { PaymentMethod } from "@/types/invoice";

/** Filters for GET /api/reports (R38). Dates are inclusive YYYY-MM-DD. */
export interface ReportFilters {
  date_from: string;
  date_to: string;
  plan?: string;
  customer_id?: number;
}

export type SubscriptionStatus = "draft" | "quotation" | "confirmed" | "active" | "paused" | "closed";

/** Everything the Reports page shows, for the chosen filters. All amounts calculated by the backend. */
export interface ReportData {
  summary: {
    /** Point-in-time (today), filtered by plan/customer only. */
    active_subscriptions: number;
    mrr: number;
    /** Within the date range (invoice_date), excluding draft and cancelled. */
    invoiced: number;
    /** Payments received within the date range. */
    collected: number;
    /** Unpaid balance today. */
    outstanding: number;
    overdue_amount: number;
    overdue_count: number;
  };
  /** One entry per month in the range, oldest first. `month` is YYYY-MM. */
  revenue_by_month: Array<{ month: string; invoiced: number; collected: number }>;
  revenue_by_plan: Array<{ plan: string; invoiced: number; collected: number }>;
  subscriptions_by_status: Array<{ status: SubscriptionStatus; count: number }>;
  subscriptions_by_plan: Array<{ plan: string; count: number; mrr: number }>;
  subscriptions: Array<{
    id: number;
    number: string;
    customer_name: string;
    plan_name: string;
    status: SubscriptionStatus;
    start_date: string;
    mrr: number;
  }>;
  payments_by_month: Array<{ month: string; amount: number; count: number }>;
  payments_by_method: Array<{ method: PaymentMethod; amount: number; count: number }>;
  /** Up to 100 most recent payments in the range; `payments_total` is the full count. */
  payments: Array<{
    id: number;
    number: string;
    payment_date: string;
    customer_name: string;
    invoice_id: number;
    invoice_number: string;
    method: PaymentMethod;
    amount: number;
  }>;
  payments_total: number;
  /** Fixed order: 1–30, 31–60, 61–90, 90+ days. */
  overdue_aging: Array<{ bucket: string; amount: number; count: number }>;
  overdue: Array<{
    id: number;
    number: string;
    customer_name: string;
    plan_name: string;
    due_date: string;
    days_overdue: number;
    balance: number;
  }>;
}
