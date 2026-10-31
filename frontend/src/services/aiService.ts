import { api, isLive, toApiError } from "@/services/api";
import { mockAi } from "@/mocks/ai";
import type { AiActionResult, AiChatRequest, AiChatResponse } from "@/types/ai";

// Contract: frontend/docs/API_AI_CONTRACT.md — backend routers/ai.py returns `reply` in this shape.
const LIVE = isLive("ai");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const aiService = {
  async chat(body: AiChatRequest): Promise<AiChatResponse> {
    if (!LIVE) return mockAi.chat(body);
    // LLM + tools can be slow; allow up to 60 s.
    const { conversation_id, reply } = await request<AiChatResponse>(() => api.post("/api/ai/chat", body, { timeout: 60_000 }));
    return {
      conversation_id,
      reply: {
        ...reply,
        tool_calls: reply.tool_calls ?? [],
        data: reply.data ?? undefined,
        pending_action: reply.pending_action ?? undefined,
        suggestions: reply.suggestions ?? undefined,
      },
    };
  },

  /** Runs a prepared action (admin only). */
  approve(actionId: string): Promise<AiActionResult> {
    return LIVE ? request(() => api.post(`/api/ai/actions/${actionId}/approve`)) : mockAi.approve(actionId);
  },

  reject(actionId: string): Promise<AiActionResult> {
    return LIVE ? request(() => api.post(`/api/ai/actions/${actionId}/reject`)) : mockAi.reject(actionId);
  },
};
