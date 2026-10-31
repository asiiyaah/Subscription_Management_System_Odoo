import type { ReactNode } from "react";
import { Skeleton } from "@/components/common/States";
import { cn } from "@/lib/cn";

const TONES = {
  violet: "from-violet/25 to-violet/5 text-violet",
  success: "from-success/25 to-success/5 text-success",
  accent: "from-accent/25 to-accent/5 text-accent",
  danger: "from-danger/25 to-danger/5 text-danger",
  primary: "from-primary/25 to-primary/5 text-primary",
  info: "from-info/25 to-info/5 text-info",
};

interface SummaryCardProps {
  icon: ReactNode;
  label: string;
  /** Pass undefined while loading to show a skeleton. */
  value: ReactNode | undefined;
  tone: keyof typeof TONES;
  /** Makes the card a button (e.g. jump to a filtered list). */
  onClick?: () => void;
}

/** Compact icon + label + value card for the summary strip above list pages. */
export function SummaryCard({ icon, label, value, tone, onClick }: SummaryCardProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-line bg-surface/70 p-4 text-left",
        onClick && "transition hover:border-primary/50 hover:bg-surface",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br [&>svg]:size-5",
          TONES[tone],
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted">{label}</span>
        {value === undefined ? (
          <Skeleton className="mt-1.5 h-5 w-24" />
        ) : (
          <span className="block truncate text-lg font-bold">{value}</span>
        )}
      </span>
    </Tag>
  );
}
