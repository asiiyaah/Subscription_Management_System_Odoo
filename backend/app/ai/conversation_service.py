"""Persistence helpers for user-owned assistant conversations."""

from datetime import datetime, timezone
import json

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.ai import AIConversation, AIMessage
from app.models.user import User


def get_or_create_conversation(db: Session, user: User, conversation_id, title: str) -> AIConversation:
    if conversation_id:
        conversation = db.query(AIConversation).filter(
            AIConversation.id == conversation_id, AIConversation.user_id == user.id).first()
        if not conversation:
            raise HTTPException(404, "Conversation not found")
        return conversation
    conversation = AIConversation(user_id=user.id, title=title[:100])
    db.add(conversation)
    db.flush()
    return conversation


def recent_messages(db: Session, conversation_id, *, limit: int = 20) -> list[AIMessage]:
    rows = (db.query(AIMessage).filter(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.created_at.desc()).limit(max(1, min(limit, 40))).all())
    return list(reversed(rows))


def add_message(db: Session, conversation: AIConversation, *, role: str, content: str,
                tool_calls: dict | None = None) -> AIMessage:
    message = AIMessage(conversation_id=conversation.id, role=role, content=content[:8000], tool_calls=tool_calls)
    db.add(message)
    conversation.updated_at = datetime.now(timezone.utc)
    return message


def serialize_history(db: Session, conversation: AIConversation) -> dict:
    rows = db.query(AIMessage).filter(AIMessage.conversation_id == conversation.id).order_by(AIMessage.created_at).all()
    return {"id": str(conversation.id), "title": conversation.title,
        "messages": [{"id": str(row.id), "role": row.role, "content": row.content,
            "tool_calls": row.tool_calls, "created_at": row.created_at.isoformat() if row.created_at else None}
            for row in rows]}


def verified_tool_context(rows: list[AIMessage], *, include_business_data: bool, limit_chars: int = 8000) -> str:
    """Format recent server results for a follow-up prompt without exposing them to customer roles."""
    if not include_business_data:
        return ""
    blocks = []
    budget = max(0, limit_chars)
    for row in reversed(rows):
        data = (row.tool_calls or {}).get("results") if row.tool_calls else None
        if not data:
            continue
        encoded = json.dumps(data, ensure_ascii=False, default=str)
        block = f"Prior verified tool results: {encoded}"
        if len(block) > budget:
            block = block[:budget]
        if block:
            blocks.append(block)
            budget -= len(block)
        if budget <= 0:
            break
    return "\n".join(reversed(blocks))

