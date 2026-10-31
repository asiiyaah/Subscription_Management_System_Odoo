import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { ChatWindow } from "@/components/ai/ChatWindow";
import { useAiChat } from "@/components/ai/useAiChat";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * AI Subscription Assistant. Open with a question already asked via `/assistant?q=...`
 * (e.g. from the Dashboard's AI box).
 */
export default function AIAssistant() {
  const chat = useAiChat();
  const [params, setParams] = useSearchParams();
  const [confirmReset, setConfirmReset] = useState(false);

  // Send ?q= once, then remove it so a refresh doesn't ask again.
  const handledQuery = useRef(false);
  useEffect(() => {
    const q = params.get("q");
    if (!q || handledQuery.current) return;
    handledQuery.current = true;
    setParams({}, { replace: true });
    chat.send(q);
  }, [params, setParams, chat]);

  return (
    // Fills the screen below the header (4rem) minus main's vertical padding (3rem).
    <div className="flex h-[calc(100dvh-7rem)] min-h-[32rem] flex-col">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AI Assistant</h1>
          <p className="mt-1 text-sm text-muted">Ask in plain language. Answers come from your billing data.</p>
        </div>
        {chat.entries.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)} disabled={chat.isSending}>
            <RotateCcw aria-hidden /> New chat
          </Button>
        )}
      </div>

      <ChatWindow chat={chat} />

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          chat.reset();
          setConfirmReset(false);
        }}
        title="Start a new chat?"
        description="This conversation will be cleared. Actions you already approved are not undone."
        confirmLabel="New chat"
      />
    </div>
  );
}
