import { formatCurrency, formatNumber } from "@/lib/format";
import type { Discount } from "@/types/discount";

/** "10% off" / "₹500 off" */
export function formatDiscountValue(d: Pick<Discount, "type" | "value">): string {
  return d.type === "percentage" ? `${formatNumber(d.value)}% off` : `${formatCurrency(d.value).replace(/\.00$/, "")} off`;
}

/** "Min ₹1,999 · Min 5 seats" or "No minimum" */
export function formatDiscountConditions(d: Pick<Discount, "min_purchase" | "min_quantity">): string {
  const parts = [
    d.min_purchase ? `Min ${formatCurrency(d.min_purchase).replace(/\.00$/, "")}` : null,
    d.min_quantity ? `Min ${d.min_quantity} seats` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No minimum";
}
