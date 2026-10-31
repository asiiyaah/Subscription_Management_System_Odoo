from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.ai import agent, provider_factory
from app.ai.provider import ProviderError, ProviderTurn, ToolCall
from app.ai.tool_registry import TOOL_NAMES, TOOL_SCHEMAS, validate_tool_arguments
from app.ai.tools import execute_tool


class ScriptedProvider:
    name = "test-provider"

    def __init__(self, turns):
        self.turns = list(turns)
        self.messages = []
        self.schemas = None

    def respond(self, messages, tools, *, timeout=None):
        self.messages.append(list(messages))
        self.schemas = tools
        return self.turns.pop(0)


def test_registry_schemas_match_allowlisted_tools_and_arguments_are_validated():
    assert {schema["name"] for schema in TOOL_SCHEMAS} == TOOL_NAMES
    assert validate_tool_arguments("get_expiring_subscriptions", {"days": 7}) == {"days": 7}
    with pytest.raises(ValueError):
        validate_tool_arguments("get_expiring_subscriptions", {"days": 400})
    with pytest.raises(ValueError):
        validate_tool_arguments("get_revenue_summary", {"sql": "select * from users"})


def test_execute_tool_rejects_invalid_arguments_and_customer_analytics():
    admin = SimpleNamespace(role="admin", customer_id=None)
    customer = SimpleNamespace(role="customer", customer_id="customer-id")
    with pytest.raises(HTTPException) as invalid:
        execute_tool(None, admin, "get_expiring_subscriptions", {"days": 999})
    assert invalid.value.status_code == 422
    with pytest.raises(HTTPException) as denied:
        execute_tool(None, customer, "get_revenue_summary", {})
    assert denied.value.status_code == 403


def test_agent_runs_multiple_tools_and_returns_tool_results(monkeypatch):
    executed = []
    monkeypatch.setattr(agent, "execute_tool", lambda db, user, name, args: executed.append(name) or {"mrr": "10.00"})
    monkeypatch.setattr(agent, "prepare_action", lambda *args: None)
    provider = ScriptedProvider([
        ProviderTurn(tool_calls=[ToolCall("call_1", "get_mrr", {}), ToolCall("call_2", "get_revenue_by_plan", {})]),
        ProviderTurn(content="MRR is ₹10 and plan revenue results are shown."),
    ])
    result = agent.run_agent(provider, db=None, user=SimpleNamespace(role="admin"),
        conversation_id="conversation-id", messages=[{"role": "user", "content": "Compare MRR and plan revenue"}])
    assert executed == ["get_mrr", "get_revenue_by_plan"]
    assert [call["name"] for call in result.tool_calls] == executed
    assert result.content.startswith("MRR is")
    assert result.tool_results[0]["result"] == {"mrr": "10.00"}
    assert provider.schemas and provider.schemas[0]["parameters"]["type"] == "object"
    assert any(message["role"] == "tool" for message in provider.messages[1])


def test_agent_does_not_present_failed_tool_as_factual_answer(monkeypatch):
    def fail(*args):
        raise HTTPException(422, "Invalid arguments for get_expiring_subscriptions")
    monkeypatch.setattr(agent, "execute_tool", fail)
    provider = ScriptedProvider([
        ProviderTurn(tool_calls=[ToolCall("call_1", "get_expiring_subscriptions", {"days": 0})]),
        ProviderTurn(content="There are no subscriptions expiring."),
    ])
    result = agent.run_agent(provider, db=None, user=SimpleNamespace(role="admin"),
        conversation_id="conversation-id", messages=[])
    assert result.tool_calls[0]["status"] == "error"
    assert "couldn't retrieve" in result.content
    assert "no subscriptions expiring" not in result.content


def test_provider_factory_supports_openai_compatible_configuration(monkeypatch):
    monkeypatch.setattr(provider_factory.settings, "AI_PROVIDER", "openrouter")
    monkeypatch.setattr(provider_factory.settings, "AI_API_KEY", "test-key")
    monkeypatch.setattr(provider_factory.settings, "AI_MODEL", "test-model")
    monkeypatch.setattr(provider_factory.settings, "AI_BASE_URL", "")
    provider = provider_factory.get_provider()
    assert isinstance(provider, provider_factory.OpenAICompatibleProvider)
    assert provider.base_url == "https://openrouter.ai/api/v1"
    assert provider.model == "test-model"


def test_openai_compatible_adapter_normalizes_native_function_calls(monkeypatch):
    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": None, "tool_calls": [{"id": "tc1", "function": {
                "name": "get_mrr", "arguments": "{}"}}]}}], "usage": {"prompt_tokens": 12, "completion_tokens": 4}}

    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: FakeResponse())
    provider = provider_factory.OpenAICompatibleProvider(name="test", api_key="secret-test", model="model", base_url="https://example.test/v1")
    turn = provider.respond([{"role": "user", "content": "MRR?"}], TOOL_SCHEMAS)
    assert turn.tool_calls[0].name == "get_mrr"
    assert turn.tool_calls[0].arguments == {}
    assert turn.usage == {"input_tokens": 12, "output_tokens": 4}


def test_openai_compatible_adapter_sanitizes_malformed_response(monkeypatch):
    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"unexpected": True}

    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: FakeResponse())
    provider = provider_factory.OpenAICompatibleProvider(name="test", api_key="unused", model="model", base_url="https://example.test/v1")
    with pytest.raises(ProviderError, match="invalid response"):
        provider.respond([], TOOL_SCHEMAS)

