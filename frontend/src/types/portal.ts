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
