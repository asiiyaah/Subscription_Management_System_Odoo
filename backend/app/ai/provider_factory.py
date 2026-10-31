"""Construct supported LLM adapters from environment-backed settings."""

from app.ai.provider import LLMProvider, ProviderError, ProviderTurn, ToolCall
from app.core.config import settings


def _gemini_schema(schema: dict) -> dict:
    """Reduce JSON Schema output to the subset accepted by Gemini function declarations."""
    if not isinstance(schema, dict):
        return schema
    if "anyOf" in schema:
        choices = [choice for choice in schema["anyOf"] if choice.get("type") != "null"]
        base = _gemini_schema(choices[0]) if choices else {"type": "string"}
        if len(choices) < len(schema["anyOf"]):
            base["nullable"] = True
        if schema.get("description"):
            base["description"] = schema["description"]
        return base
    output = {}
    for key, value in schema.items():
        if key in {"title", "$schema", "$defs", "default", "format", "additionalProperties"}:
            continue
        if key == "properties":
            output[key] = {name: _gemini_schema(prop) for name, prop in value.items()}
        elif key == "items":
            output[key] = _gemini_schema(value)
        else:
            output[key] = value
    return output


def _configured_key(provider: str) -> str:
    key = (settings.AI_API_KEY or "").strip()
    if key:
        return key
    # Backward compatibility for installations that already use the legacy keys.
    if provider in {"gemini", "google"}:
        return (settings.GEMINI_API_KEY or "").strip()
    if provider == "openai":
        return (settings.OPENAI_API_KEY or "").strip()
    return ""


def _configured_model(provider: str) -> str:
    if settings.AI_MODEL.strip():
        return settings.AI_MODEL.strip()
    if provider in {"gemini", "google"}:
        return settings.GEMINI_MODEL
    if provider == "openai":
        return settings.OPENAI_MODEL
    return ""


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, *, name: str, api_key: str, model: str, base_url: str):
        self.name, self.api_key, self.model, self.base_url = name, api_key, model, base_url.rstrip("/")

    def respond(self, messages, tools, *, timeout=None):
        import json
        import logging
        import uuid

        import httpx

        logger = logging.getLogger(__name__)
        payload = {"model": self.model, "messages": messages,
            "temperature": settings.AI_TEMPERATURE, "max_tokens": settings.AI_MAX_TOKENS}
        if tools:
            payload.update({"tools": [{"type": "function", "function": tool} for tool in tools], "tool_choice": "auto"})
        try:
            request_timeout = min(float(timeout or settings.AI_TIMEOUT_SECONDS), float(settings.AI_TIMEOUT_SECONDS))
            response = httpx.post(f"{self.base_url}/chat/completions", timeout=request_timeout,
                headers={"Authorization": f"Bearer {self.api_key}"}, json=payload)
            if response.status_code == 429:
                raise ProviderError("The AI provider is rate limiting requests. Try again shortly.", status_code=429)
            response.raise_for_status()
            body = response.json()
            choice = body["choices"][0]["message"]
            calls = []
            for item in choice.get("tool_calls") or []:
                function = item.get("function") or {}
                raw_args = function.get("arguments", "{}")
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except (TypeError, json.JSONDecodeError):
                    args = None
                calls.append(ToolCall(id=str(item.get("id") or uuid.uuid4()),
                    name=str(function.get("name") or ""), arguments=args if isinstance(args, dict) else {"__invalid__": raw_args}))
            usage = body.get("usage") or {}
            return ProviderTurn(content=choice.get("content") or "", tool_calls=calls,
                usage={"input_tokens": int(usage.get("prompt_tokens", 0) or 0),
                    "output_tokens": int(usage.get("completion_tokens", 0) or 0)})
        except ProviderError:
            raise
        except httpx.TimeoutException as exc:
            logger.warning("AI provider timeout (%s)", self.name)
            raise ProviderError("The AI provider timed out. Try again.") from exc
        except httpx.HTTPStatusError as exc:
            logger.warning("AI provider HTTP failure (%s): %s", self.name, exc.response.status_code)
            raise ProviderError("The AI provider could not complete the request.", status_code=exc.response.status_code) from exc
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            logger.warning("AI provider response failure (%s): %s", self.name, type(exc).__name__)
            raise ProviderError("The AI provider returned an invalid response.") from exc


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self, *, api_key: str, model: str):
        self.api_key, self.model = api_key, model

    def respond(self, messages, tools, *, timeout=None):
        import logging
        import uuid

        import httpx

        logger = logging.getLogger(__name__)
        system = next((m["content"] for m in messages if m.get("role") == "system"), "")
        contents = []
        for message in messages:
            role = message.get("role")
            if role == "system":
                continue
            if role == "tool":
                contents.append({"role": "user", "parts": [{"functionResponse": {
                    "name": message.get("name", "unknown"), "response": {"result": message.get("content", "")}}}]})
            elif role == "assistant" and message.get("tool_calls"):
                parts = [{"functionCall": {"name": call["function"]["name"],
                    "args": __import__("json").loads(call["function"]["arguments"])
                    if isinstance(call["function"].get("arguments"), str) else call["function"].get("arguments", {})}}
                    for call in message["tool_calls"]]
                if message.get("content"):
                    parts.insert(0, {"text": message["content"]})
                contents.append({"role": "model", "parts": parts})
            else:
                contents.append({"role": "model" if role == "assistant" else "user",
                    "parts": [{"text": message.get("content", "")}]})
        declarations = [{"name": tool["name"], "description": tool["description"],
            "parameters": _gemini_schema(tool["parameters"])} for tool in tools]
        payload = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents,
            "generationConfig": {"temperature": settings.AI_TEMPERATURE,
                "maxOutputTokens": settings.AI_MAX_TOKENS}}
        if declarations:
            payload["tools"] = [{"functionDeclarations": declarations}]
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        try:
            request_timeout = min(float(timeout or settings.AI_TIMEOUT_SECONDS), float(settings.AI_TIMEOUT_SECONDS))
            response = httpx.post(endpoint, params={"key": self.api_key}, timeout=request_timeout, json=payload)
            if response.status_code == 429:
                raise ProviderError("The AI provider is rate limiting requests. Try again shortly.", status_code=429)
            response.raise_for_status()
            body = response.json()
            parts = body["candidates"][0]["content"]["parts"]
            calls = [ToolCall(id=str(uuid.uuid4()), name=part["functionCall"]["name"],
                arguments=part["functionCall"].get("args") or {}) for part in parts if "functionCall" in part]
            content = "\n".join(part.get("text", "") for part in parts if part.get("text"))
            usage = body.get("usageMetadata") or {}
            return ProviderTurn(content=content, tool_calls=calls,
                usage={"input_tokens": int(usage.get("promptTokenCount", 0) or 0),
                    "output_tokens": int(usage.get("candidatesTokenCount", 0) or 0)})
        except ProviderError:
            raise
        except httpx.TimeoutException as exc:
            logger.warning("AI provider timeout (gemini)")
            raise ProviderError("The AI provider timed out. Try again.") from exc
        except httpx.HTTPStatusError as exc:
            logger.warning("AI provider HTTP failure (gemini): %s", exc.response.status_code)
            raise ProviderError("The AI provider could not complete the request.", status_code=exc.response.status_code) from exc
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            logger.warning("AI provider response failure (gemini): %s", type(exc).__name__)
            raise ProviderError("The AI provider returned an invalid response.") from exc


def get_provider() -> LLMProvider | None:
    provider = (settings.AI_PROVIDER or "").strip().lower().replace("-", "_")
    key = _configured_key(provider)
    placeholders = {"your_gemini_api_key", "your_actual_gemini_api_key", "replace_with_a_secure_random_secret", "your_api_key"}
    if not key or key.lower() in placeholders:
        return None
    model = _configured_model(provider)
    if provider in {"gemini", "google"}:
        if not model:
            raise ProviderError("AI_MODEL or GEMINI_MODEL must be configured.")
        return GeminiProvider(api_key=key, model=model)
    defaults = {"openai": "https://api.openai.com/v1", "groq": "https://api.groq.com/openai/v1",
        "openrouter": "https://openrouter.ai/api/v1"}
    if provider in defaults or (provider in {"openai_compatible", "custom"} and settings.AI_BASE_URL.strip()):
        base_url = settings.AI_BASE_URL.strip() or defaults.get(provider, "")
        if not model:
            raise ProviderError("AI_MODEL must be configured for this provider.")
        return OpenAICompatibleProvider(name=provider, api_key=key, model=model, base_url=base_url)
    raise ProviderError("AI_PROVIDER must be gemini, openai, groq, openrouter, or openai_compatible with AI_BASE_URL.")

