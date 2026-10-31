import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { ChatInput } from "@/components/ai/ChatInput";
import { ChatMessage, TypingIndicator } from "@/components/ai/ChatMessage";
import { SuggestedPrompts } from "@/components/ai/SuggestedPrompts";
import type { useAiChat } from "@/components/ai/useAiChat";

type Chat = ReturnType<typeof useAiChat>;

/** Message list + input. All state lives in useAiChat(). */
export function ChatWindow({ chat }: { chat: Chat }) {
  const { entries, isSending, send, retry, approve, reject } = chat;
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistantId = [...entries].reverse().find((e) => e.role === "assistant")?.id;

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length, isSending]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-line bg-surface/40" aria-live="polite">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
          {entries.length === 0 ? (
            <div className="space-y-8 py-4">
              <div className="flex flex-col items-center text-center">
                <span className="relative flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-accent text-white shadow-2xl shadow-primary/40">
                  <Sparkles className="size-8" aria-hidden />
                  <span className="absolute inset-0 -z-10 animate-pulse rounded-3xl bg-primary/40 blur-xl" aria-hidden />
                </span>
                <h2 className="mt-5 text-xl font-bold">How can I help with your subscriptions today?</h2>
                <p className="mt-1 max-w-md text-sm text-muted">
                  I answer from your live data and can prepare tasks like invoices and reminders — you approve before
                  anything is sent or created.
                </p>
              </div>
              <SuggestedPrompts onPick={send} />
            </div>
          ) : (
            entries.map((entry) => (
              <ChatMessage
                key={entry.id}
                entry={entry}
                showSuggestions={entry.id === lastAssistantId && !isSending}
                onSuggestion={send}
                onRetry={retry}
                onApprove={approve}
                onReject={reject}
                disabled={isSending}
              />
            ))
          )}
          {isSending && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-3xl">
        <ChatInput onSend={send} disabled={isSending} />
      </div>
    </div>
  );
}
