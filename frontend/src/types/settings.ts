import type { Id } from "@/types/common";
/** Seller details used on invoices and emails (Settings → Business, admin only). */
export interface BusinessSettings {
  company_name: string;
  address: string;
  email: string;
  phone: string;
  gstin: string;
  /** Fixed to INR for now. */
  currency: "INR";
  invoice_prefix: string;
  subscription_prefix: string;
  /** Days between invoice date and due date, e.g. 15 = "Net 15". */
  payment_terms_days: number;
  bank: { name: string; account: string; ifsc: string; upi: string };
}

/** Scheduled jobs the backend runs (APScheduler). Settings → Automation, admin only. */
export interface AutomationSettings {
  /** Create draft invoices every day for subscriptions that are due. */
  auto_generate_invoices: boolean;
  /** "HH:MM", 24-hour, server time zone. */
  invoice_run_time: string;
  /** Email customers this many days before a subscription ends; 0 = off. */
  renewal_reminder_days: number;
  /** Email customers this many days after an invoice becomes overdue; 0 = off. */
  overdue_reminder_days: number;
  /** Close subscriptions automatically when their plan says so and the end date passes. */
  auto_close_expired: boolean;
}

/** The signed-in user's own details (any role). */
export interface Profile {
  id: Id;
  name: string;
  email: string;
  phone?: string;
  /** Customers only. */
  company?: string;
  /** Customers only. */
  billing_address?: string;
}

export type ProfileUpdate = Pick<Profile, "name" | "phone" | "company" | "billing_address">;

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

/** POST /api/auth/change-password — a fresh token comes back because the old one stops working. */
export interface ChangePasswordResponse {
  message: string;
  access_token?: string;
}
