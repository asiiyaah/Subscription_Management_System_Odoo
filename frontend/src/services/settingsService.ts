import { api, isLive, toApiError } from "@/services/api";
import { mockSettings } from "@/mocks/settings";
import { BUSINESS } from "@/lib/business";
import { tokenStorage } from "@/lib/tokenStorage";
import type { AutomationSettings, BusinessSettings } from "@/types/settings";

// Contract: frontend/docs/API_SETTINGS_PORTAL_CONTRACT.md. Backend: GET/PATCH /api/settings (one record for business
// details + automation, admin/staff), GET /api/settings/business (seller details, any signed-in user).
const LIVE = isLive("settings");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

interface ApiSettings {
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  invoice_prefix?: string;
  subscription_prefix?: string;
  default_payment_terms?: number;
  gstin: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  auto_generate_invoices?: boolean;
  send_renewal_reminders?: boolean;
  auto_close_expired?: boolean;
  invoice_run_time?: string;
  renewal_reminder_days?: number | null;
  overdue_reminder_days?: number | null;
}

/** Empty values fall back to the defaults so invoices always show a complete seller block. */
const toBusiness = (s: ApiSettings): BusinessSettings => ({
  company_name: s.business_name || BUSINESS.name,
  address: s.address || BUSINESS.address,
  email: s.email || BUSINESS.email,
  phone: s.phone || BUSINESS.phone,
  gstin: s.gstin || BUSINESS.gstin,
  currency: "INR",
  invoice_prefix: s.invoice_prefix ?? "INV",
  subscription_prefix: s.subscription_prefix ?? "SUB",
  payment_terms_days: s.default_payment_terms ?? 15,
  bank: {
    name: s.bank_name || BUSINESS.bank.name,
    account: s.bank_account || BUSINESS.bank.account,
    ifsc: s.bank_ifsc || BUSINESS.bank.ifsc,
    upi: s.upi_id || BUSINESS.bank.upi,
  },
});

/** The backend stores reminder days only when reminders are on; "off" is sent as null. */
const toAutomation = (s: ApiSettings): AutomationSettings => ({
  auto_generate_invoices: Boolean(s.auto_generate_invoices),
  invoice_run_time: s.invoice_run_time || "06:00",
  renewal_reminder_days: s.send_renewal_reminders ? (s.renewal_reminder_days ?? 7) : 0,
  overdue_reminder_days: s.overdue_reminder_days ?? 0,
  auto_close_expired: Boolean(s.auto_close_expired),
});

export const settingsService = {
  /** Everything is stored by the backend now; kept so the Settings page can still hide what a backend lacks. */
  capabilities: {
    gstinAndBank: true,
    invoiceRunTime: true,
    overdueReminders: true,
    reminderDays: true,
    customersCanRead: true,
  },

  /** Seller details for invoices — readable by every signed-in user, customers included. */
  async getBusiness(): Promise<BusinessSettings> {
    if (!LIVE) return mockSettings.getBusiness();
    const url = tokenStorage.getUser()?.role === "customer" ? "/api/settings/business" : "/api/settings";
    return toBusiness(await request<ApiSettings>(() => api.get(url)));
  },

  /** Admin only. */
  async updateBusiness(input: BusinessSettings): Promise<BusinessSettings> {
    if (!LIVE) return mockSettings.updateBusiness(input);
    const saved = await request<ApiSettings>(() =>
      api.patch("/api/settings", {
        business_name: input.company_name,
        email: input.email,
        phone: input.phone,
        address: input.address,
        gstin: input.gstin,
        invoice_prefix: input.invoice_prefix,
        subscription_prefix: input.subscription_prefix,
        default_payment_terms: input.payment_terms_days,
        bank_name: input.bank.name,
        bank_account: input.bank.account,
        bank_ifsc: input.bank.ifsc,
        upi_id: input.bank.upi,
      }),
    );
    return toBusiness(saved);
  },

  /** Admin only. */
  async getAutomation(): Promise<AutomationSettings> {
    if (!LIVE) return mockSettings.getAutomation();
    return toAutomation(await request<ApiSettings>(() => api.get("/api/settings")));
  },

  /** Admin only. */
  async updateAutomation(input: AutomationSettings): Promise<AutomationSettings> {
    if (!LIVE) return mockSettings.updateAutomation(input);
    const saved = await request<ApiSettings>(() =>
      api.patch("/api/settings", {
        auto_generate_invoices: input.auto_generate_invoices,
        invoice_run_time: input.invoice_run_time,
        send_renewal_reminders: input.renewal_reminder_days > 0,
        renewal_reminder_days: input.renewal_reminder_days > 0 ? input.renewal_reminder_days : null,
        overdue_reminder_days: input.overdue_reminder_days > 0 ? input.overdue_reminder_days : null,
        auto_close_expired: input.auto_close_expired,
      }),
    );
    return toAutomation(saved);
  },
};
