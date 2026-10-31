import { useState } from "react";
import { CheckCircle2, ChevronDown, Wrench, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AiToolCall } from "@/types/ai";

function formatArgs(args: AiToolCall["args"]): string {
  return Object.entries(args)
    .map(([key, value]) => `${key}=${typeof value === "string" ? `"${value}"` : value}`)
    .join(", ");
}

/** The backend tools the AI called for this answer — proof it used real data, not guesses. */
export function ToolExecutionStatus({ calls }: { calls: AiToolCall[] }) {
  const [open, setOpen] = useState(true);
  if (calls.length === 0) return null;

  return (
    <div className="rounded-2xl border border-line bg-bg/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 font-medium text-muted transition hover:text-ink"
      >
        <Wrench className="size-3.5" aria-hidden />
        Used {calls.length} tool{calls.length > 1 ? "s" : ""}
        <ChevronDown className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-line px-3 py-2.5">
          {calls.map((call, index) => (
            <li
              key={call.id}
              className="flex animate-fade-up flex-wrap items-center gap-x-2 gap-y-0.5"
              style={{ animationDelay: `${index * 180}ms` }}
            >
              {call.status === "success" ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="Succeeded" />
              ) : (
                <XCircle className="size-3.5 shrink-0 text-danger" aria-label="Failed" />
              )}
              <code className="font-mono text-ink">
                {call.name}({formatArgs(call.args)})
              </code>
              <span className="text-muted">— {call.summary}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
