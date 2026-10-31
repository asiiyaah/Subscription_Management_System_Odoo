import type { Id } from "@/types/common";
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
  next_billing_date: string | null;
  total: number;
  billing_period?: string;
  is_pausable?: boolean;
  is_renewable?: boolean;
  allows_early_closure?: boolean;
  lines?: Array<{ product_id: Id; product_name?: string | null; plan_name?: string | null;
    description: string | null; quantity: number; line_total: number }>;
}
