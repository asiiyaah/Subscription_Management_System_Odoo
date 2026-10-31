import type { ReactNode } from "react";
import { Skeleton } from "@/components/common/States";
import { cn } from "@/lib/cn";

export function StatCard({ label, value, icon, onClick }: { label: string; value?: ReactNode; icon: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return <Tag type={onClick ? "button" : undefined} onClick={onClick} className={cn("flex min-h-28 w-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 text-left", onClick && "transition hover:border-primary/50 hover:bg-surface-2/40")}>
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/10 text-primary [&>svg]:size-5">{icon}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm text-muted">{label}</span>{value === undefined ? <Skeleton className="mt-2 h-7 w-28" /> : <span className="mt-1 block truncate text-xl font-bold tabular-nums">{value}</span>}</span>
  </Tag>;
}
