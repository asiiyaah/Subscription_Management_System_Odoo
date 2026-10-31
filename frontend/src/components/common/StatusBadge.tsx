import { cn } from "@/lib/cn";

type Tone = "muted" | "violet" | "info" | "success" | "accent" | "danger" | "warning" | "grey";

const TONE_CLASSES: Record<Tone, string> = {
  muted: "bg-muted/15 text-muted ring-muted/30",
  violet: "bg-violet/15 text-violet ring-violet/40",
  info: "bg-info/15 text-info ring-info/40",
  success: "bg-success/15 text-success ring-success/40",
  accent: "bg-accent/15 text-accent ring-accent/40",
  danger: "bg-danger/15 text-danger ring-danger/40",
  warning: "bg-warning/15 text-warning ring-warning/40",
  grey: "bg-white/5 text-white/50 ring-white/15",
};

/** One colour per status, used everywhere (subscriptions, invoices, discounts, payments…). */
const STATUS_TONES: Record<string, Tone> = {
  // Subscriptions: Draft → Quotation → Confirmed → Active → Closed (+ Paused)
  draft: "muted",
  quotation: "violet",
  confirmed: "info",
  active: "success",
  paused: "accent",
  closed: "grey",
  // Invoices: Draft → Confirmed → Paid (+ Cancelled, Overdue)
  paid: "success",
  partially_paid: "warning",
  overdue: "danger",
  cancelled: "danger",
  // Discounts / plans / products
  scheduled: "violet",
  expired: "grey",
  used_up: "grey",
  archived: "grey",
  inactive: "grey",
  // Generic
  pending: "warning",
  failed: "danger",
};

function toLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONES[status.toLowerCase()] ?? "muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {toLabel(status)}
    </span>
  );
}
