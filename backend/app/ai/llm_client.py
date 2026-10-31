"""Compatibility exports for the former provider module."""

import json

from app.ai.provider import LLMProvider, ProviderError, ProviderTurn, ToolCall
from app.ai.provider_factory import get_provider
from app.ai.prompts import build_system_prompt
from app.core.config import settings


def _system_prompt(role: str = "admin") -> str:
    return build_system_prompt(role)


def parse_assistant_payload(response: str):
    """Parse legacy JSON-mode model output while tolerating ordinary text replies."""
    try:
        payload = json.loads(response)
    except (TypeError, json.JSONDecodeError):
        return {"answer": response}
    return payload if isinstance(payload, dict) else {"answer": response}

