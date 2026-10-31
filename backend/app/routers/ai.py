from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.llm_client import get_provider, parse_assistant_payload, _system_prompt
from app.ai.tools import execute_tool, TOOL_NAMES
from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.ai import AIActionApproval, AIConversation, AIMessage
from app.models.user import User
from app.services.reminder_service import prepare_renewal_reminders

router = APIRouter(prefix="/api/ai", tags=["ai assistant"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    conversation_id: UUID | None = None


class ApprovalRequest(BaseModel):
    approval_id: UUID
    approve: bool


@router.post("/chat")
def chat(payload: ChatRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = db.get(AIConversation, payload.conversation_id) if payload.conversation_id else None
    if conversation and conversation.user_id != user.id and user.role not in {"admin", "staff"}:
        raise HTTPException(404, "Conversation not found")
    if not conversation:
        conversation = AIConversation(user_id=user.id, title=payload.message[:100])
        db.add(conversation)
        db.flush()
    db.add(AIMessage(conversation_id=conversation.id, role="user", content=payload.message))
    db.flush()
    provider = get_provider()
    tool_result = None
    if not provider:
        response_text = "The AI assistant is unavailable because no API key is configured. Business APIs remain available."
        structured = {"answer": response_text}
    else:
        history = db.query(AIMessage).filter(AIMessage.conversation_id == conversation.id).order_by(AIMessage.created_at).limit(30).all()
        prompt = _system_prompt() + "\nConversation:\n" + "\n".join(f"{m.role}: {m.content}" for m in history)
        try:
            structured = parse_assistant_payload(provider.complete(prompt))
        except Exception as exc:
            raise HTTPException(502, f"AI provider request failed ({type(exc).__name__})") from exc
        tool_name = structured.get("tool")
        if tool_name:
            if tool_name not in TOOL_NAMES:
                raise HTTPException(400, "AI requested an unsupported tool")
            arguments = structured.get("arguments") if isinstance(structured.get("arguments"), dict) else {}
            if tool_name == "prepare_renewal_reminders" and arguments.get("send"):
                approval = AIActionApproval(user_id=user.id, action_type="send_renewal_reminders", action_payload={"days": int(arguments.get("days", 30))}, status="pending")
                db.add(approval)
                tool_result = {"requires_approval": True, "approval_id": None, "message": "Reminder sending requires an administrator approval."}
                db.flush()
                tool_result["approval_id"] = str(approval.id)
            else:
                tool_result = execute_tool(db, user, tool_name, arguments)
            structured = {"tool": tool_name, "arguments": arguments, "result": tool_result}
            response_text = f"Tool {tool_name} completed."
        else:
            response_text = str(structured.get("answer", ""))
    db.add(AIMessage(conversation_id=conversation.id, role="assistant", content=response_text, tool_calls=structured if tool_result is not None else None))
    db.commit()
    return {"conversation_id": str(conversation.id), "response": response_text,
        "tool_result": tool_result, "structured_result": structured}


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = db.get(AIConversation, conversation_id)
    if not conversation or conversation.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    messages = db.query(AIMessage).filter(AIMessage.conversation_id == conversation_id).order_by(AIMessage.created_at).all()
    return {"id": str(conversation.id), "title": conversation.title,
        "messages": [{"role": m.role, "content": m.content, "tool_calls": m.tool_calls, "created_at": m.created_at.isoformat() if m.created_at else None} for m in messages]}


@router.post("/approve")
def approve_action(payload: ApprovalRequest, db: Session = Depends(get_db), admin: User = Depends(require_roles("admin"))):
    approval = db.query(AIActionApproval).filter(AIActionApproval.id == payload.approval_id).with_for_update().first()
    if not approval:
        raise HTTPException(404, "Approval request not found")
    if approval.status != "pending":
        raise HTTPException(409, "Approval request has already been reviewed")
    approval.status = "approved" if payload.approve else "rejected"
    approval.approved_at = datetime.now(timezone.utc) if payload.approve else None
    db.commit()
    reminder_result = None
    if payload.approve and approval.action_type == "send_renewal_reminders":
        reminder_result = prepare_renewal_reminders(db, days=int(approval.action_payload.get("days", 30)))
        if not reminder_result["failed"]:
            approval.executed_at = datetime.now(timezone.utc)
            db.commit()
    return {"approval_id": str(approval.id), "status": approval.status,
        "execution": "completed" if approval.executed_at else "pending" if payload.approve else "not_executed",
        "result": reminder_result, "message": "Approval was recorded." if payload.approve else "Approval was rejected."}
