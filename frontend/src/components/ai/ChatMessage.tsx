import { AlertTriangle, Copy, RotateCw, Sparkles } from "lucide-react";
import { ApprovalCard } from "@/components/ai/ApprovalCard";
import { ResultView } from "@/components/ai/ResultView";
import { ToolExecutionStatus } from "@/components/ai/ToolExecutionStatus";
import { useToast } from "@/components/ui/Toast";
import { MiniMarkdown } from "@/lib/miniMarkdown";
import type { ChatEntry } from "@/types/ai";

interface Props {
  entry: ChatEntry;
  /** Show follow-up suggestion chips (only on the latest answer). */
  showSuggestions: boolean;
  onSuggestion: (text: string) => void;
  onRetry: (errorId: string) => void;
  onApprove: (entryId: string) => void;
  onReject: (entryId: string) => void;
  disabled: boolean;
}

export function ChatMessage({ entry, showSuggestions, onSuggestion, onRetry, onApprove, onReject, disabled }: Props) {
  const toast = useToast();

  if (entry.role === "user") {
    return (
      <div className="flex animate-fade-up justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-r from-primary to-accent px-4 py-2.5 text-sm whitespace-pre-wrap text-white shadow-lg shadow-primary/20">
          {entry.content}
        </p>
      </div>
    );
  }

  if (entry.role === "error") {
    return (
      <div className="flex animate-fade-up gap-3">
        <Avatar error />
        <div role="alert" className="rounded-2xl rounded-tl-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <p className="text-ink">{entry.content}</p>
          <button
            type="button"
            onClick={() => onRetry(entry.id)}
            disabled={disabled}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
          >
            <RotateCw className="size-3.5" aria-hidden /> Try again
          </button>
        </div>
      </div>
    );
  }

  const { reply } = entry;

  async function copy() {
    try {
      await navigator.clipboard.writeText(reply.content.replace(/\*\*/g, ""));
      toast.success("Answer copied");
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  return (
    <div className="flex animate-fade-up gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3">
        <ToolExecutionStatus calls={reply.tool_calls} />

        <div className="group relative rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink/90">
          <MiniMarkdown text={reply.content} />
          <button
            type="button"
            onClick={copy}
            aria-label="Copy answer"
            className="absolute right-2 top-2 rounded-lg p-1.5 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-surface-2 hover:text-ink focus-visible:opacity-100"
          >
            <Copy className="size-3.5" />
          </button>
        </div>

        {reply.data && <ResultView data={reply.data} />}

        {reply.pending_action && (
          <ApprovalCard
            action={reply.pending_action}
            state={entry.actionState ?? "pending"}
            message={entry.actionMessage}
            onApprove={() => onApprove(entry.id)}
            onReject={() => onReject(entry.id)}
          />
        )}

        {showSuggestions && reply.suggestions && reply.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {reply.suggestions.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => onSuggestion(text)}
                disabled={disabled}
                className="rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs font-medium text-ink transition hover:border-primary/60 hover:bg-surface-2 disabled:opacity-50"
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ error = false }: { error?: boolean }) {
  return (
    <span
      className={
        error
          ? "flex size-8 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger"
          : "flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/30"
      }
      aria-hidden
    >
      {error ? <AlertTriangle className="size-4" /> : <Sparkles className="size-4" />}
    </span>
  );
}

/** Shown while the assistant is working. */
export function TypingIndicator() {
  return (
    <div className="flex animate-fade-up gap-3" role="status" aria-label="Assistant is thinking">
      <Avatar />
      <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3">
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="size-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
        <span className="text-xs text-muted">Checking your data…</span>
      </div>
    </div>
  );
}
