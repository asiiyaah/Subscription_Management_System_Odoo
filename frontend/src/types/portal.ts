import type { Id, ListQuery } from "@/types/common";
import type { InvoiceSummaryRow } from "@/types/invoice";

/** GET /api/portal/summary — the signed-in customer's own data only (R6). */
export interface PortalSummary {
  customer_name: string;
  active_subscriptions: number;
  outstanding: number;
  overdue_amount: number;
  /** The unpaid invoice due soonest, or null if nothing is owed. */
  next_due: { invoice_id: Id; number: string; due_date: string; balance: number; is_overdue: boolean } | null;
  subscriptions: Array<{
    id: Id;
    number: string;
    plan_name: string;
    /** Any subscription status (draft … closed). */
    status: string;
    next_invoice_date: string | null;
    /** Monthly amount after discounts, before tax. */
    monthly_amount: number;
  }>;
  recent_invoices: InvoiceSummaryRow[];
}

export interface PortalSubscription {
  id: Id;
  subscription_number: string;
  plan_name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  billing_period?: string | null;
  billing_interval?: number | null;
  next_billing_date: string | null;
  /** Backend's monthly-normalized value from GET /api/portal/subscriptions. */
  monthly_amount?: number | string;
  subtotal?: number | string;
  discount_total?: number | string;
  tax_total?: number | string;
  total: number | string;
  notes?: string | null;
  history?: Array<{ previous_status?: string | null; new_status?: string | null; action?: string | null; notes?: string | null; created_at?: string | null }>;
  is_pausable?: boolean;
  is_renewable?: boolean;
  allows_early_closure?: boolean;
  lines?: Array<{ product_id: Id; plan_id?: Id | null; product_name?: string | null; plan_name?: string | null;
    description?: string | null; quantity: number | string; unit_price?: number | string; discount_amount?: number | string;
    tax_amount?: number | string; line_total: number | string }>;
}

export interface PortalSubscriptionListQuery extends Pick<ListQuery, "page" | "page_size"> {
  search?: string;
  status?: string;
}
