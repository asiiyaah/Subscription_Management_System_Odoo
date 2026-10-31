// Contract between the AI Assistant UI and POST /api/ai/chat (Member 3's AI service).
// Full description: frontend/docs/API_AI_CONTRACT.md

/** One backend tool the model called, e.g. get_overdue_invoices(). Shown as a step in the chat. */
export interface AiToolCall {
  id: string;
  name: string;
  args: Record<string, string | number | boolean>;
  status: "success" | "error";
  /** Short human result, e.g. "6 invoices found". */
  summary: string;
}

export type AiCellFormat = "text" | "currency" | "date" | "number" | "status";

/** Structured result the UI renders below the reply. */
export type AiResultData =
  | {
      kind: "table";
      title: string;
      columns: Array<{ key: string; label: string; format?: AiCellFormat; align?: "left" | "right" }>;
      rows: Array<Record<string, string | number | null>>;
      /** If set, each row links to `${link.base}${row[link.key]}` (e.g. "/invoices/" + id). */
      link?: { base: string; key: string };
    }
  | {
      kind: "metrics";
      title: string;
      items: Array<{ label: string; value: number; format: "currency" | "number"; hint?: string }>;
    }
  | {
      kind: "bar_chart";
      title: string;
      /** Bars are sorted as given. */
      bars: Array<{ label: string; value: number; hint?: string }>;
      format: "currency" | "number";
    };

/** A consequential action the AI prepared but must not run without approval (bulk reminders, invoices). */
export interface AiPendingAction {
  id: string;
  type: "send_renewal_reminders" | "send_overdue_reminders" | "generate_invoices";
  title: string;
  description: string;
  /** What will happen, one line per item (e.g. each reminder email). */
  preview: Array<{ label: string; detail: string }>;
  confirm_label: string;
}

export interface AiAssistantReply {
  id: string;
  /** Markdown-lite: **bold**, line breaks, and "- " bullet lines. */
  content: string;
  tool_calls: AiToolCall[];
  data?: AiResultData;
  pending_action?: AiPendingAction;
  /** Optional follow-up questions to offer as chips. */
  suggestions?: string[];
}

export interface AiChatRequest {
  message: string;
  /** Omit to start a new conversation. */
  conversation_id?: string;
}

export interface AiChatResponse {
  conversation_id: string;
  reply: AiAssistantReply;
}

export interface AiActionResult {
  status: "completed" | "rejected";
  /** Shown on the approval card, e.g. "4 draft invoices created". */
  message: string;
}

// --- UI-only state ---------------------------------------------------------------

export type ActionState = "pending" | "approving" | "completed" | "rejected" | "failed";

export type ChatEntry =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      reply: AiAssistantReply;
      actionState?: ActionState;
      actionMessage?: string;
    }
  | { id: string; role: "error"; content: string; retryOf: string };
