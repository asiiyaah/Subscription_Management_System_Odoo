import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { aiService } from "@/services/aiService";
import { ApiError } from "@/services/api";
import type { ActionState, ChatEntry } from "@/types/ai";

const STORAGE_KEY = "subscriptiq.ai.chat";

interface Saved {
  entries: ChatEntry[];
  conversationId?: string;
}

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

let localId = 1;
const newId = () => `local_${Date.now().toString(36)}_${localId++}`;

/**
 * Chat state for the AI Assistant: messages, sending, retry, approve/reject.
 * Kept in sessionStorage so the chat survives moving to another page and back.
 */
export function useAiChat() {
  const queryClient = useQueryClient();
  const initial = useRef(load()).current;
  const [entries, setEntries] = useState<ChatEntry[]>(initial.entries);
  const [conversationId, setConversationId] = useState<string | undefined>(initial.conversationId);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, conversationId } satisfies Saved));
    } catch {
      // Storage unavailable (private mode) — the chat still works, it just won't be restored.
    }
  }, [entries, conversationId]);

  const ask = useCallback(
    async (userEntryId: string, message: string) => {
      setIsSending(true);
      try {
        const { conversation_id, reply } = await aiService.chat({ message, conversation_id: conversationId });
        setConversationId(conversation_id);
        setEntries((list) => [
          ...list,
          { id: reply.id, role: "assistant", reply, actionState: reply.pending_action ? "pending" : undefined },
        ]);
      } catch (error) {
        const text = error instanceof ApiError ? error.message : "The assistant couldn't answer. Please try again.";
        setEntries((list) => [...list, { id: newId(), role: "error", content: text, retryOf: userEntryId }]);
      } finally {
        setIsSending(false);
      }
    },
    [conversationId],
  );

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || isSending) return;
      const id = newId();
      setEntries((list) => [...list, { id, role: "user", content: message }]);
      void ask(id, message);
    },
    [ask, isSending],
  );

  const retry = useCallback(
    (errorId: string) => {
      const error = entries.find((e) => e.id === errorId);
      if (!error || error.role !== "error" || isSending) return;
      const original = entries.find((e) => e.id === error.retryOf);
      setEntries((list) => list.filter((e) => e.id !== errorId));
      if (original?.role === "user") void ask(original.id, original.content);
    },
    [entries, ask, isSending],
  );

  const setAction = (entryId: string, actionState: ActionState, actionMessage?: string) =>
    setEntries((list) =>
      list.map((e) => (e.id === entryId && e.role === "assistant" ? { ...e, actionState, actionMessage } : e)),
    );

  const decide = useCallback(
    async (entryId: string, approve: boolean) => {
      const entry = entries.find((e) => e.id === entryId);
      if (entry?.role !== "assistant" || !entry.reply.pending_action) return;
      const action = entry.reply.pending_action;
      setAction(entryId, "approving");
      try {
        const result = approve ? await aiService.approve(action.id) : await aiService.reject(action.id);
        setAction(entryId, result.status === "completed" ? "completed" : "rejected", result.message);
        // Generated invoices should show up on the Invoices page straight away.
        if (approve && action.type === "generate_invoices") queryClient.invalidateQueries({ queryKey: ["invoices"] });
      } catch (error) {
        setAction(entryId, "failed", error instanceof ApiError ? error.message : "The action failed. Please try again.");
      }
    },
    [entries, queryClient],
  );

  const reset = useCallback(() => {
    setEntries([]);
    setConversationId(undefined);
  }, []);

  return {
    entries,
    isSending,
    send,
    retry,
    approve: (entryId: string) => decide(entryId, true),
    reject: (entryId: string) => decide(entryId, false),
    reset,
  };
}
