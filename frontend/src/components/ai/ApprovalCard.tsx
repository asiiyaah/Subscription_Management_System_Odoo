import { useState } from "react";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useIsAdmin } from "@/context/AuthContext";
import { cn } from "@/lib/cn";
import type { ActionState, AiPendingAction } from "@/types/ai";

const PREVIEW_ROWS = 4;

interface Props {
  action: AiPendingAction;
  state: ActionState;
  message?: string;
  onApprove: () => void;
  onReject: () => void;
}

/** "The AI proposes, the admin decides": nothing is sent or created until an admin approves. */
export function ApprovalCard({ action, state, message, onApprove, onReject }: Props) {
  const isAdmin = useIsAdmin();
  const [showAll, setShowAll] = useState(false);
  const items = showAll ? action.preview : action.preview.slice(0, PREVIEW_ROWS);
  const done = state === "completed" || state === "rejected";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border",
        state === "completed" ? "border-success/40" : state === "failed" ? "border-danger/40" : done ? "border-line" : "border-warning/50",
      )}
    >
      <header className={cn("flex items-start gap-3 px-4 py-3", done ? "bg-surface" : "bg-warning/10")}>
        <ShieldAlert className={cn("mt-0.5 size-5 shrink-0", done ? "text-muted" : "text-warning")} aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-warning">
            {done ? "Action" : "Needs your approval"}
          </p>
          <h3 className="font-semibold">{action.title}</h3>
          <p className="text-xs text-muted">{action.description}</p>
        </div>
      </header>

      <ul className="divide-y divide-line/60 border-t border-line bg-surface text-sm">
        {items.map((item, i) => (
          <li key={i} className="px-4 py-2">
            <p className="font-medium">{item.label}</p>
            <p className="text-xs text-muted">{item.detail}</p>
          </li>
        ))}
        {action.preview.length > PREVIEW_ROWS && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full px-4 py-2 text-left text-xs font-semibold text-primary hover:bg-surface-2/50"
            >
              {showAll ? "Show fewer" : `Show all ${action.preview.length}`}
            </button>
          </li>
        )}
      </ul>

      <footer className="border-t border-line bg-surface px-4 py-3">
        {state === "completed" && (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" aria-hidden /> {message}
          </p>
        )}
        {state === "rejected" && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <XCircle className="size-4" aria-hidden /> {message}
          </p>
        )}
        {(state === "pending" || state === "approving" || state === "failed") && (
          <div className="space-y-2">
            {state === "failed" && (
              <p role="alert" className="text-sm text-danger">
                {message}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!isAdmin && <p className="mr-auto text-xs text-muted">Only an admin can approve this.</p>}
              <Button variant="secondary" size="sm" onClick={onReject} disabled={state === "approving"}>
                Cancel
              </Button>
              <Button size="sm" onClick={onApprove} loading={state === "approving"} disabled={!isAdmin}>
                {state === "failed" ? "Try again" : action.confirm_label}
              </Button>
            </div>
          </div>
        )}
      </footer>
    </section>
  );
}
