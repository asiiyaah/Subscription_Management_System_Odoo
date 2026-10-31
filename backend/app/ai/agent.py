"""Bounded multi-step tool orchestration for an authenticated assistant turn."""

import json
import logging
from dataclasses import dataclass, field
from time import perf_counter
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.ai.approval_service import prepare_action
from app.ai.provider import LLMProvider, ProviderTurn, ToolCall
from app.ai.response_formatter import tool_call_record
from app.ai.tool_registry import tool_names_for_role, tool_schemas_for_role
from app.ai.tools import execute_tool
from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)
MAX_TOOL_ROUNDS = 4
MAX_TOOL_CALLS = 8
MAX_TOOL_RESULT_CHARS = 12000


@dataclass
class AgentResult:
    content: str
    tool_calls: list[dict] = field(default_factory=list)
    tool_results: list[dict] = field(default_factory=list)
    pending_action: dict | None = None
    structured_result: dict | None = None
    usage: dict[str, int] = field(default_factory=dict)


def _legacy_calls(turn: ProviderTurn):
    """Accept old JSON-mode tool/answer payloads during provider migration."""
    calls = list(turn.tool_calls)
    content = turn.content
    if not content or calls:
        return calls, content, None
    try:
        payload = json.loads(content)
    except (TypeError, json.JSONDecodeError):
        return calls, content, None
    if not isinstance(payload, dict):
        return calls, content, None
    values = payload.get("tool_calls")
    if isinstance(values, list):
        for item in values:
            if isinstance(item, dict):
                calls.append(ToolCall(id=str(item.get("id") or uuid4()), name=str(item.get("name") or ""),
                    arguments=item.get("arguments", item.get("args", {}))))
    elif payload.get("tool"):
        calls.append(ToolCall(id=str(uuid4()), name=str(payload["tool"]),
            arguments=payload.get("arguments") if isinstance(payload.get("arguments"), dict) else {}))
    answer = payload.get("answer")
    if isinstance(answer, str):
        content = answer
    elif calls:
        content = ""
    return calls, content, payload


def run_agent(provider: LLMProvider, *, db: Session, user: User, conversation_id,
              messages: list[dict]) -> AgentResult:
    messages = list(messages)
    result = AgentResult(content="")
    successes: list[tuple[str, dict]] = []
    failures: list[str] = []
    call_count = 0
    deadline = perf_counter() + settings.AI_TURN_TIMEOUT_SECONDS

    for _round in range(MAX_TOOL_ROUNDS):
        remaining = deadline - perf_counter()
        if remaining <= 0:
            raise HTTPException(504, "The assistant took too long to complete this request. Try again.")
        provider_started = perf_counter()
        turn = provider.respond(messages, tool_schemas_for_role(user.role), timeout=remaining)
        result.usage["input_tokens"] = result.usage.get("input_tokens", 0) + int(turn.usage.get("input_tokens", 0))
        result.usage["output_tokens"] = result.usage.get("output_tokens", 0) + int(turn.usage.get("output_tokens", 0))
        logger.info("AI provider response conversation=%s provider=%s duration_ms=%d input_tokens=%d output_tokens=%d",
            conversation_id, getattr(provider, "name", type(provider).__name__),
            round((perf_counter() - provider_started) * 1000), turn.usage.get("input_tokens", 0), turn.usage.get("output_tokens", 0))
        tool_calls, final_content, structured = _legacy_calls(turn)
        if structured is not None:
            result.structured_result = structured
        if not tool_calls:
            result.content = final_content.strip()
            break
        if call_count + len(tool_calls) > MAX_TOOL_CALLS:
            raise HTTPException(422, "The assistant requested too many tools in one turn")

        openai_calls = []
        for call in tool_calls:
            call.id = call.id or f"call_{uuid4().hex}"
            call_id = call.id
            arguments = call.arguments if isinstance(call.arguments, dict) else {"__invalid__": call.arguments}
            openai_calls.append({"id": call_id, "type": "function", "function": {
                "name": call.name, "arguments": json.dumps(arguments, default=str)}})
        messages.append({"role": "assistant", "content": turn.content or None, "tool_calls": openai_calls})

        for call in tool_calls:
            call_count += 1
            args = call.arguments if isinstance(call.arguments, dict) else {"__invalid__": call.arguments}
            started = perf_counter()
            try:
                if call.name not in tool_names_for_role(user.role):
                    raise HTTPException(403, "This assistant tool is not available for your account")
                if result.pending_action and call.name in {"create_invoice_drafts", "prepare_renewal_reminders", "prepare_overdue_reminders"}:
                    raise HTTPException(422, "Only one approval action can be prepared per message")
                tool_result = execute_tool(db, user, call.name, args)
                pending = prepare_action(db, user, call.name, args, tool_result)
                if pending:
                    result.pending_action = pending
                    tool_result = dict(tool_result)
                    tool_result["pending_action"] = pending
                status = "success"
                successes.append((call.name, tool_result))
            except HTTPException as exc:
                status = "error"
                tool_result = {"error": str(exc.detail)}
                failures.append(f"{call.name}: {exc.detail}")
            except Exception as exc:
                logger.exception("AI tool failed conversation=%s tool=%s", conversation_id, call.name)
                status = "error"
                tool_result = {"error": "The requested business query failed."}
                failures.append(f"{call.name}: query failed")
            duration_ms = round((perf_counter() - started) * 1000)
            logger.info("AI tool execution conversation=%s tool=%s status=%s duration_ms=%d",
                conversation_id, call.name, status, duration_ms)
            result.tool_calls.append(tool_call_record(call.id, call.name, args, status,
                tool_result.get("error") if status == "error" else tool_result))
            result.tool_results.append({"name": call.name, "status": status, "result": tool_result})
            serialized = json.dumps(tool_result, default=str, ensure_ascii=False)
            if len(serialized) > MAX_TOOL_RESULT_CHARS:
                serialized = serialized[:MAX_TOOL_RESULT_CHARS] + "… [result truncated]"
            messages.append({"role": "tool", "tool_call_id": call.id, "name": call.name, "content": serialized})
    else:
        raise HTTPException(502, "The assistant could not finish its response within the tool-call limit")

    if failures:
        result.content = "I couldn't retrieve all requested information: " + "; ".join(failures)
        if successes:
            result.content += ". Some requested results are available below."
    elif not result.content:
        result.content = "The requested business data is ready." if successes else "I couldn't prepare a response. Please try rephrasing your question."
    if result.pending_action:
        result.content += " Nothing has been sent or created yet; an administrator must approve the pending action."
    return result

