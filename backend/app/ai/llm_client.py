"""Provider adapters. No API key is required by the rest of the backend."""

import json
from abc import ABC, abstractmethod

import httpx

from app.core.config import settings


class LLMProvider(ABC):
    @abstractmethod
    def complete(self, prompt: str) -> str: ...


class GeminiProvider(LLMProvider):
    def complete(self, prompt: str) -> str:
        from google import genai
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        response = client.models.generate_content(model=settings.GEMINI_MODEL, contents=prompt)
        return response.text or ""


class OpenAIProvider(LLMProvider):
    def complete(self, prompt: str) -> str:
        response = httpx.post("https://api.openai.com/v1/chat/completions", timeout=30,
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={"model": settings.OPENAI_MODEL, "response_format": {"type": "json_object"},
                  "messages": [{"role": "system", "content": _system_prompt()}, {"role": "user", "content": prompt}]})
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


def _system_prompt():
    return "You are the SubscriptIQ business assistant. Never invent business facts. Choose at most one listed tool and return JSON as {tool: tool_name, arguments: {...}}. For ordinary answers return JSON as {answer: text}. Never request SQL. Tools: get_mrr; get_revenue(start_date,end_date); get_active_subscriptions; get_expiring_subscriptions(days); get_overdue_invoices; get_customer_balance(customer_id); get_revenue_by_plan; get_revenue_summary; get_outstanding_by_customer; get_subscriptions_due_for_billing; create_invoice_drafts(dry_run); generate_due_invoice_preview; prepare_renewal_reminders(days). Creating invoices or sending reminders only prepares an approval action; never claim an action was completed."


def get_provider() -> LLMProvider | None:
    provider = settings.AI_PROVIDER.lower()
    placeholders = {"", "your_gemini_api_key", "your_actual_gemini_api_key", "replace_with_a_secure_random_secret"}
    if provider == "gemini" and settings.GEMINI_API_KEY.strip() not in placeholders:
        return GeminiProvider()
    if provider == "openai" and settings.OPENAI_API_KEY.strip() not in placeholders:
        return OpenAIProvider()
    return None


def parse_assistant_payload(response: str):
    try:
        payload = json.loads(response)
    except (TypeError, json.JSONDecodeError):
        return {"answer": response}
    return payload if isinstance(payload, dict) else {"answer": response}
