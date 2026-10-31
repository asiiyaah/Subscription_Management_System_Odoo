"""HTTP boundary for the provider-independent, database-grounded AI assistant."""

import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.agent import run_agent
from app.ai.approval_service import review_action
from app.ai.conversation_service import add_message, get_or_create_conversation, recent_messages, serialize_history, verified_tool_context
from app.ai.llm_client import get_provider, _system_prompt
from app.ai.provider import ProviderError
from app.ai.response_formatter import present
from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.ai import AIConversation
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai assistant"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    conversation_id: UUID | None = None


class ApprovalRequest(BaseModel):
    approval_id: UUID
    approve: bool


def _suggestions(names: list[str]) -> list[str]:
    if any(name in {"get_overdue_invoices", "get_outstanding_payments"} for name in names):
        return ["Which customers owe the most?", "Prepare overdue reminders"]
    if any(name in {"get_expiring_subscriptions", "prepare_renewal_reminders"} for name in names):
        return ["Show subscriptions expiring in the next 30 days", "Show active subscriptions"]
    if any(name in {"get_revenue_summary", "get_mrr", "get_monthly_recurring_revenue"} for name in names):
        return ["Which plan generates the most revenue?", "Show collections by month"]
    return ["Show overdue invoices", "What is our MRR?"]


@router.post("/chat")
def chat(payload: ChatRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = get_or_create_conversation(db, user, payload.conversation_id, payload.message)
    history = recent_messages(db, conversation.id, limit=20)
    add_message(db, conversation, role="user", content=payload.message)
    provider = None
    try:
        provider = get_provider()
    except ProviderError as exc:
        db.rollback()
        logger.error("AI provider configuration invalid: %s", str(exc))
        raise HTTPException(503, str(exc)) from exc

    if provider is None:
        content = "The AI assistant is unavailable because no provider API key is configured. Business APIs remain available."
        calls, results, pending, data, structured, usage = [], [], None, None, None, {}
    else:
        context = verified_tool_context(history, include_business_data=user.role in {"admin", "staff"})
        prompt = _system_prompt(user.role) + ("\n\n" + context if context else "")
        messages = [{"role": "system", "content": prompt}]
        messages.extend({"role": row.role, "content": row.content} for row in history if row.role in {"user", "assistant"})
        messages.append({"role": "user", "content": payload.message})
        try:
            agent = run_agent(provider, db=db, user=user, conversation_id=conversation.id, messages=messages)
        except ProviderError as exc:
            db.rollback()
            status_code = 429 if exc.status_code == 429 else 502
            logger.warning("AI provider request failed conversation=%s: %s", conversation.id, str(exc))
            raise HTTPException(status_code, str(exc)) from exc
        except HTTPException:
            db.rollback()
            raise
        except Exception as exc:
            db.rollback()
            logger.exception("AI assistant turn failed conversation=%s", conversation.id)
            raise HTTPException(502, "The assistant could not complete this request. Try again.") from exc

        content = agent.content
        calls, results = agent.tool_calls, agent.tool_results
        pending, structured, usage = agent.pending_action, agent.structured_result, agent.usage
        data = None
        for item in reversed(results):
            if item["status"] == "success":
                data = present(item["name"], item["result"])
                if data is not None:
                    break

    names = [call["name"] for call in calls]
    reply = {"id": str(uuid4()), "content": content, "tool_calls": calls,
        "data": data, "pending_action": pending, "suggestions": _suggestions(names) if names else []}
    add_message(db, conversation, role="assistant", content=content,
        tool_calls={"calls": calls, "results": results, "usage": usage} if calls else None)
    db.commit()
    result_value = (results[0]["result"] if len(results) == 1 else
        {"results": results} if results else None)
    return {"conversation_id": str(conversation.id), "reply": reply,
        # Keep the legacy top-level keys for existing clients.
        "response": content, "tool_result": result_value, "structured_result": structured}


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = db.query(AIConversation).filter(
        AIConversation.id == conversation_id, AIConversation.user_id == user.id).first()
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    return serialize_history(db, conversation)


@router.post("/actions/{action_id}/approve")
def approve_prepared_action(action_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    return review_action(db, action_id, approve=True)


@router.post("/actions/{action_id}/reject")
def reject_prepared_action(action_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return review_action(db, action_id, approve=False, actor=user)


@router.post("/approve")
def approve_action(payload: ApprovalRequest, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    result = review_action(db, payload.approval_id, approve=payload.approve)
    return result | {"approval_id": str(payload.approval_id), "execution": result["status"], "result": None}

