import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "error" | "success" | "info";

const TONES: Record<Tone, { box: string; icon: ReactNode }> = {
  error: {
    box: "border-danger/40 bg-danger/10 text-danger",
    icon: <AlertCircle className="size-4.5 shrink-0" aria-hidden />,
  },
  success: {
    box: "border-success/40 bg-success/10 text-success",
    icon: <CheckCircle2 className="size-4.5 shrink-0" aria-hidden />,
  },
  info: {
    box: "border-violet/40 bg-violet/10 text-ink",
    icon: <Info className="size-4.5 shrink-0 text-violet" aria-hidden />,
  },
};

export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm", TONES[tone].box)}
    >
      {TONES[tone].icon}
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}
