import { useQuery } from "@tanstack/react-query";
import { BUSINESS } from "@/lib/business";
import { settingsService } from "@/services/settingsService";
import type { BusinessSettings } from "@/types/settings";

/** Used until the real settings load, so invoices never render without a seller block. */
const FALLBACK: BusinessSettings = {
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
};

/** Seller details from Settings → Business (cached for 5 minutes). */
export function useBusinessSettings(): BusinessSettings {
  const { data } = useQuery({
    queryKey: ["settings", "business"],
    queryFn: () => settingsService.getBusiness(),
    staleTime: 5 * 60_000,
  });
  return data ?? FALLBACK;
}
