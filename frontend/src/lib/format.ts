const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const number = new Intl.NumberFormat("en-IN");

const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** ₹1,24,500.00 — or ₹1.2L with `compact` (for KPI cards and chart axes). */
export function formatCurrency(amount: number, options: { compact?: boolean } = {}): string {
  return (options.compact ? compactCurrency : currency).format(amount);
}

/** 1,24,500 */
export function formatNumber(value: number): string {
  return number.format(value);
}

/** 31 Oct 2026 */
export function formatDate(value: string | Date): string {
  return date.format(new Date(value));
}

/** 31 Oct 2026, 2:30 pm */
export function formatDateTime(value: string | Date): string {
  return dateTime.format(new Date(value));
}

/** Whole days from today to `value` (negative = in the past). */
export function daysUntil(value: string | Date): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(value);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** "Today", "in 3 days", "5 days ago" — for due and expiry dates. */
export function formatRelativeDays(value: string | Date): string {
  const days = daysUntil(value);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Date → "YYYY-MM-DD" in the user's time zone (for <input type="date"> and API params). */
export function toIsoDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
