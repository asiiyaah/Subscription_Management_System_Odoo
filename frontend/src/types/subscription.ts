import type { ListQuery, Paginated } from "@/types/common";

export type SubscriptionStatus = "draft" | "quotation" | "confirmed" | "active" | "paused" | "closed";
export type SubscriptionId = string;

export interface SubscriptionLineInput {
  product_id: string;
  plan_id?: string;
  product_attribute_value_id?: string;
  quantity: number;
}

/** Mirrors SubscriptionInput in backend/app/routers/subscriptions.py. */
export interface SubscriptionCreate {
  customer_id: string;
  lines: SubscriptionLineInput[];
  notes?: string;
  start_date?: string;
  end_date?: string;
  discount_id?: string;
  quotation_template_id?: string;
  quotation_valid_until?: string;
  status: "draft" | "quotation";
}

export type SubscriptionUpdate = Partial<Pick<Subscription, "notes" | "start_date" | "end_date">>;
export type SubscriptionAction = "confirm" | "activate" | "pause" | "resume" | "renew" | "close";

export interface SubscriptionPreviewLine {
  quantity: number | string;
  unit_price: number | string;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
}

export interface SubscriptionPreview {
  subtotal: number | string;
  discount_total: number | string;
  tax_total: number | string;
  total: number | string;
  lines: SubscriptionPreviewLine[];
}

export interface SubscriptionLine {
  id?: string;
  product_id: string;
  plan_id?: string | null;
  product_attribute_value_id?: string | null;
  description?: string | null;
  quantity: number | string;
  unit_price: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  line_total: number | string;
  product_name?: string;
  plan_name?: string;
  variant_name?: string;
}

export interface SubscriptionHistoryEntry {
  previous_status?: SubscriptionStatus | null;
  new_status?: SubscriptionStatus | null;
  action?: string | null;
  notes?: string | null;
  created_at?: string | null;
}

/** Mirrors _subscription_dict() in backend/app/routers/subscriptions.py. */
export interface Subscription {
  id: SubscriptionId;
  subscription_number: string;
  customer_id: string;
  customer_name?: string;
  customer_email?: string | null;
  status: SubscriptionStatus;
  start_date?: string | null;
  end_date?: string | null;
  next_billing_date?: string | null;
  quotation_valid_until?: string | null;
  quotation_template_id?: string | null;
  billing_period?: string | null;
  billing_interval?: number | null;
  subtotal: number | string;
  discount_total: number | string;
  tax_total: number | string;
  total: number | string;
  notes?: string | null;
  lines: SubscriptionLine[];
  history?: SubscriptionHistoryEntry[];
}

export interface SubscriptionListQuery extends ListQuery {
  status?: SubscriptionStatus;
  customer_id?: string;
}

export interface SubscriptionCustomerOption {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
}

export interface SubscriptionProductDetail {
  id: string;
  name: string;
  product_type: string;
  sales_price: number | string;
  status?: string | null;
  attributes: Array<{
    id: string;
    name: string;
    values: Array<{ id: string; value: string; extra_price: number | string }>;
  }>;
}

export interface SubscriptionDiscountOption {
  id: string;
  code?: string | null;
  name: string;
  active: boolean;
  status?: string;
}

export interface SubscriptionTemplateOption {
  id: string;
  name: string;
  description?: string | null;
  payment_terms?: string | null;
  validity_days: number;
  status: string;
  lines: Array<{ product_id: string; plan_id?: string | null; quantity: number | string; unit_price?: number | string }>;
}

export interface SubscriptionInvoice {
  id: string;
  invoice_number: string;
  status: string;
  invoice_date: string;
  due_date: string;
  total: number | string;
  balance_due: number | string;
}

export type SubscriptionInvoicePage = Paginated<SubscriptionInvoice>;
