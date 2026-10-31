// Stand-in for /api/settings. Saved in localStorage so changes survive a reload (like the real database would).
import { ApiError } from "@/services/api";
import { mockDelay } from "@/mocks/utils";
import { BUSINESS } from "@/lib/business";
import type { AutomationSettings, BusinessSettings } from "@/types/settings";

const KEY = "subscriptiq.mock.settings";

const DEFAULTS: { business: BusinessSettings; automation: AutomationSettings } = {
  business: {
    company_name: BUSINESS.name,
    address: BUSINESS.address,
    email: BUSINESS.email,
    phone: BUSINESS.phone,
    gstin: BUSINESS.gstin,
    currency: "INR",
    invoice_prefix: "INV-",
    subscription_prefix: "SUB-",
    payment_terms_days: 15,
    bank: { ...BUSINESS.bank },
  },
  automation: {
    auto_generate_invoices: true,
    invoice_run_time: "06:00",
    renewal_reminder_days: 7,
    overdue_reminder_days: 3,
    auto_close_expired: true,
  },
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return saved ? { ...DEFAULTS, ...saved } : structuredClone(DEFAULTS);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save(next: typeof DEFAULTS) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

// GSTIN: 2-digit state code, 10-char PAN, entity digit, Z, check character.
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const mockSettings = {
  async getBusiness(): Promise<BusinessSettings> {
    await mockDelay(250);
    return load().business;
  },

  async updateBusiness(input: BusinessSettings): Promise<BusinessSettings> {
    await mockDelay();
    if (!GSTIN_PATTERN.test(input.gstin)) throw new ApiError(422, "GSTIN doesn't look valid (15 characters, e.g. 29AAKCS1234F1Z5).");
    if (input.payment_terms_days < 0 || input.payment_terms_days > 120) throw new ApiError(422, "Payment terms must be 0–120 days.");
    const current = load();
    save({ ...current, business: input });
    return input;
  },

  async getAutomation(): Promise<AutomationSettings> {
    await mockDelay(250);
    return load().automation;
  },

  async updateAutomation(input: AutomationSettings): Promise<AutomationSettings> {
    await mockDelay();
    const current = load();
    save({ ...current, automation: input });
    return input;
  },
};
