import { api, isLive, toApiError } from "@/services/api";
import { mockSettings } from "@/mocks/settings";
import { BUSINESS } from "@/lib/business";
import type { AutomationSettings, BusinessSettings } from "@/types/settings";

// Mock contract: frontend/docs/API_SETTINGS_PORTAL_CONTRACT.md. Live mapping follows backend/app/routers/settings.py,
// which keeps business details and automation flags in one record (GET/PATCH /api/settings, admin + staff read).
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
  currency: string;
  invoice_prefix: string;
  subscription_prefix: string;
  default_payment_terms: number;
  auto_generate_invoices: boolean;
  send_renewal_reminders: boolean;
  auto_close_expired: boolean;
}

/** GSTIN and bank details aren't stored by the backend yet — they come from the defaults. */
const toBusiness = (s: ApiSettings): BusinessSettings => ({
  company_name: s.business_name ?? BUSINESS.name,
  address: s.address ?? BUSINESS.address,
  email: s.email ?? BUSINESS.email,
  phone: s.phone ?? BUSINESS.phone,
  gstin: BUSINESS.gstin,
  currency: "INR",
  invoice_prefix: s.invoice_prefix,
  subscription_prefix: s.subscription_prefix,
  payment_terms_days: s.default_payment_terms,
  bank: { ...BUSINESS.bank },
});

/** The backend has on/off reminders only; "on" is shown as 7 days. */
const toAutomation = (s: ApiSettings): AutomationSettings => ({
  auto_generate_invoices: s.auto_generate_invoices,
  invoice_run_time: "06:00",
  renewal_reminder_days: s.send_renewal_reminders ? 7 : 0,
  overdue_reminder_days: 0,
  auto_close_expired: s.auto_close_expired,
});

export const settingsService = {
  /** Fields the connected backend can store — the Settings page disables the rest. */
  capabilities: {
    gstinAndBank: !LIVE,
    invoiceRunTime: !LIVE,
    overdueReminders: !LIVE,
    /** Choose how many days before renewal (live: on/off only). */
    reminderDays: !LIVE,
    /** Customers can read business details (live: admin and staff only, so the portal uses defaults). */
    customersCanRead: !LIVE,
  },

  async getBusiness(): Promise<BusinessSettings> {
    if (!LIVE) return mockSettings.getBusiness();
    return toBusiness(await request<ApiSettings>(() => api.get("/api/settings")));
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
        invoice_prefix: input.invoice_prefix,
        subscription_prefix: input.subscription_prefix,
        default_payment_terms: input.payment_terms_days,
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
        send_renewal_reminders: input.renewal_reminder_days > 0,
        auto_close_expired: input.auto_close_expired,
      }),
    );
    return toAutomation(saved);
  },
};
