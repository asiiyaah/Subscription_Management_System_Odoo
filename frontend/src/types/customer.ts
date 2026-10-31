import type { Id, ListQuery } from "@/types/common";

/** Customer record returned by the list endpoint. */
export interface Customer {
  id: Id;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  billing_address?: string;
  active_subscriptions: number;
  outstanding_amount: number;
  total_paid: number;
  portal_access: boolean;
  created_at: string;
}

/** Extended customer record returned by the detail endpoint. */
export interface CustomerDetail extends Customer {
  customer_since: string;
}

/** Payload sent when creating a new customer. */
export interface CustomerCreate {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  billing_address?: string;
}

/** Payload sent when editing an existing customer. */
export type CustomerUpdate = Partial<CustomerCreate>;

/** Query params the customer list endpoint accepts. */
export type CustomerListQuery = ListQuery;
