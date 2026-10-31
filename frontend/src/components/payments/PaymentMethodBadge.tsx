import { Banknote, CreditCard, Landmark, ScrollText, Smartphone, type LucideIcon } from "lucide-react";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/types/invoice";

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  upi: Smartphone,
  bank_transfer: Landmark,
  card: CreditCard,
  cash: Banknote,
  cheque: ScrollText,
};

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const Icon = PAYMENT_METHOD_ICONS[method];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2/70 px-2 py-1 text-xs font-medium text-ink">
      <Icon className="size-3.5 text-muted" aria-hidden />
      {PAYMENT_METHOD_LABELS[method]}
    </span>
  );
}
