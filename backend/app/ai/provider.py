"""Provider-neutral interface and normalized model response types."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ProviderTurn:
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)


class ProviderError(RuntimeError):
    """Sanitized provider failure; must never contain request headers or secrets."""

    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class LLMProvider(ABC):
    name: str

    @abstractmethod
    def respond(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, timeout: float | None = None) -> ProviderTurn:
        """Return assistant text and/or validated-shape tool-call candidates."""

