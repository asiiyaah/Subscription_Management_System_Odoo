import type { Id, ListQuery } from "@/types/common";

/** Brief (R25): Draft → Confirmed → Paid, plus Cancelled. */
export type InvoiceStatus = "draft" | "confirmed" | "paid" | "cancelled";

export type PaymentMethod = "upi" | "bank_transfer" | "card" | "cash" | "cheque";

export interface InvoiceLine {
  id: Id;
  product_name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  /** e.g. "GST 18%" — taxes are calculated by the backend (R23). */
  tax_label?: string;
  tax_amount: number;
  /** quantity × unit_price, before tax. */
  amount: number;
}

export interface InvoiceTax {
  label: string;
  amount: number;
}

export interface InvoicePayment {
  id: Id;
  /** e.g. "PAY-0042" */
  number: string;
  payment_date: string;
  method: PaymentMethod;
  amount: number;
  note?: string;
}

/** Row shape returned by the invoice list. */
export interface InvoiceSummaryRow {
  id: Id;
  number: string;
  status: InvoiceStatus;
  /** Backend-computed: confirmed, past due date and balance > 0. */
  is_overdue: boolean;
  customer_id: Id;
  customer_name: string;
  subscription_id: Id;
  subscription_number: string;
  invoice_date: string;
  due_date: string;
  total: number;
  amount_paid: number;
  balance: number;
}

/** Full invoice returned by GET /api/invoices/{id}. */
export interface Invoice extends InvoiceSummaryRow {
  customer_email: string;
  customer_address?: string;
  plan_name: string;
  period_start: string;
  period_end: string;
  payment_terms: string;
  lines: InvoiceLine[];
  untaxed_amount: number;
  /** Applied automatically by the backend (R33). */
  discount?: { code: string; label: string; amount: number };
  taxes: InvoiceTax[];
  tax_total: number;
  payments: InvoicePayment[];
  sent_at?: string;
  notes?: string;
}

/** Filters accepted by GET /api/invoices (on top of page/search/sort). */
export interface InvoiceListQuery extends ListQuery {
  status?: InvoiceStatus;
  overdue?: "true";
  customer_id?: Id;
  subscription_id?: Id;
}

/** GET /api/invoices/summary — counts for tabs and totals for the summary strip. */
export interface InvoiceStats {
  counts: Record<InvoiceStatus | "all" | "overdue", number>;
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
  overdue_amount: number;
}

/** One row of GET /api/invoices/due-preview (R22, R26). */
export interface DueInvoicePreview {
  subscription_id: Id;
  subscription_number: string;
  customer_name: string;
  plan_name: string;
  period_start: string;
  period_end: string;
  estimated_total: number;
  /** "ready" will be billed; "skipped" was already invoiced for this period. */
  status: "ready" | "skipped";
  skip_reason?: string;
}

export interface GenerateInvoicesResult {
  created: number;
  skipped: number;
  invoice_ids: Id[];
}

export interface RecordPaymentRequest {
  invoice_id: Id;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  note?: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
};
