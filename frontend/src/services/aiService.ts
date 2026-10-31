import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockAi } from "@/mocks/ai";
import type { AiActionResult, AiChatRequest, AiChatResponse } from "@/types/ai";

// Endpoints are documented in frontend/docs/API_AI_CONTRACT.md.

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const aiService = {
  chat(body: AiChatRequest): Promise<AiChatResponse> {
    // LLM + tools can be slow; allow up to 60 s.
    return USE_MOCKS ? mockAi.chat(body) : request(() => api.post("/api/ai/chat", body, { timeout: 60_000 }));
  },

  /** Runs a prepared action (admin only). */
  approve(actionId: string): Promise<AiActionResult> {
    return USE_MOCKS ? mockAi.approve(actionId) : request(() => api.post(`/api/ai/actions/${actionId}/approve`));
  },

  reject(actionId: string): Promise<AiActionResult> {
    return USE_MOCKS ? mockAi.reject(actionId) : request(() => api.post(`/api/ai/actions/${actionId}/reject`));
  },
};
