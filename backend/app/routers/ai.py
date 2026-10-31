from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.llm_client import get_provider, parse_assistant_payload, _system_prompt
from app.ai.tools import execute_tool, TOOL_NAMES
from app.core.dependencies import get_current_user, require_roles
from app.database.connection import get_db
from app.models.ai import AIActionApproval, AIConversation, AIMessage
from app.models.user import User
from app.services.billing_service import generate_due_invoices
from app.services.reminder_service import prepare_renewal_reminders

router = APIRouter(prefix="/api/ai", tags=["ai assistant"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    conversation_id: UUID | None = None


class ApprovalRequest(BaseModel):
    approval_id: UUID
    approve: bool


def _number(value):
    try:
        return float(Decimal(str(value or 0)))
    except Exception:
        return 0.0


def _present(name, result):
    items = result.get("items", []) if isinstance(result, dict) else []
    if name == "get_expiring_subscriptions":
        return {"kind": "table", "title": "Expiring subscriptions",
            "columns": [{"key": "number", "label": "Subscription"}, {"key": "customer_name", "label": "Customer"},
                {"key": "plan_name", "label": "Plan"}, {"key": "end_date", "label": "Ends", "format": "date"}],
            "rows": items, "link": {"base": "/subscriptions/", "key": "subscription_id"}}
    if name == "get_overdue_invoices":
        return {"kind": "table", "title": "Overdue invoices",
            "columns": [{"key": "number", "label": "Invoice"}, {"key": "customer_name", "label": "Customer"},
                {"key": "due_date", "label": "Due", "format": "date"},
                {"key": "balance", "label": "Balance", "format": "currency", "align": "right"}],
            "rows": [{**row, "balance": _number(row.get("balance"))} for row in items],
            "link": {"base": "/invoices/", "key": "id"}}
    if name in {"get_mrr", "get_revenue_summary"}:
        summary = result if name == "get_revenue_summary" else {"mrr": result.get("mrr")}
        keys = [("mrr", "MRR", "currency"), ("active_subscriptions", "Active subscriptions", "number"),
            ("collected_this_month", "Collected this month", "currency"), ("outstanding", "Outstanding", "currency")]
        return {"kind": "metrics", "title": "Revenue summary", "items": [
            {"label": label, "value": _number(summary[key]), "format": fmt}
            for key, label, fmt in keys if key in summary]}
    if name == "get_revenue":
        return {"kind": "metrics", "title": "Collected revenue",
            "items": [{"label": "Collected", "value": _number(result.get("revenue")), "format": "currency"}]}
    if name == "get_revenue_by_plan":
        return {"kind": "bar_chart", "title": "Revenue collected by plan", "format": "currency",
            "bars": [{"label": row.get("plan", ""), "value": _number(row.get("value"))}
                for row in sorted(items, key=lambda row: _number(row.get("value")), reverse=True)]}
    if name == "get_outstanding_by_customer":
        return {"kind": "table", "title": "Unpaid balance by customer",
            "columns": [{"key": "customer_name", "label": "Customer"}, {"key": "invoices", "label": "Invoices"},
                {"key": "overdue", "label": "Overdue", "format": "currency"},
                {"key": "balance", "label": "Total owed", "format": "currency"}],
            "rows": [{**row, "balance": _number(row.get("balance")), "overdue": _number(row.get("overdue"))} for row in items]}
    return None


def _summary(name, result):
    items = result.get("items", []) if isinstance(result, dict) else []
    if name in {"get_expiring_subscriptions", "get_overdue_invoices"}:
        return f"{len(items)} {'subscriptions' if name == 'get_expiring_subscriptions' else 'overdue invoices'} found."
    if name in {"get_mrr", "get_revenue_summary"}:
        return f"Monthly recurring revenue is ₹{_number(result.get('mrr')):,.2f}."
    if name == "get_revenue":
        return f"Collected revenue is ₹{_number(result.get('revenue')):,.2f}."
    if name == "get_revenue_by_plan":
        best = max(items, key=lambda row: _number(row.get("value")), default=None)
        return f"{best['plan']} has the highest collected revenue, ₹{_number(best['value']):,.2f}." if best else "No plan revenue is available."
    if name == "get_outstanding_by_customer":
        return f"{len(items)} customers have outstanding balances."
    if name == "get_active_subscriptions":
        return f"There are {result.get('count', 0)} active subscriptions."
    if name == "prepare_renewal_reminders":
        return f"{len(result.get('prepared', []))} renewal reminders are ready for review."
    if name in {"create_invoice_drafts", "get_subscriptions_due_for_billing", "generate_due_invoice_preview"}:
        return f"{len(items)} subscriptions are due for billing."
    return "The requested business data is ready."


def _prepare_action(db, user, tool, args, result):
    if tool == "create_invoice_drafts":
        rows = [row for row in result.get("items", []) if row.get("status") == "ready"]
        if not rows:
            return None
        kind = "generate_invoices"
        payload = {"on_date": date.today().isoformat(), "subscription_ids": [row["subscription_id"] for row in rows]}
        preview = [{"label": f"{row.get('customer_name','')} · {row.get('subscription_number','')}",
            "detail": f"{row.get('plan_name','')} · ₹{_number(row.get('estimated_total')):,.2f}"} for row in rows]
        title = f"Create {len(rows)} draft invoice{'s' if len(rows) != 1 else ''}"
        description = "The billing service will create the invoice drafts shown here."
        confirm = "Approve & create"
    elif tool == "prepare_renewal_reminders":
        rows = result.get("prepared", [])
        if not rows:
            return None
        kind = "send_renewal_reminders"
        payload = {"days": int(args.get("days", 30)), "subscription_ids": [row["subscription_id"] for row in rows]}
        preview = [{"label": f"{row.get('customer_name','')} · {row.get('customer_email','')}",
            "detail": f"{row.get('plan_name','')} ({row.get('subscription_number','')}) ends {row.get('end_date','')}"} for row in rows]
        title = f"Send {len(rows)} renewal reminder{'s' if len(rows) != 1 else ''}"
        description = "Emails will go to the customers shown in this preview."
        confirm = "Approve & send"
    else:
        return None
    row = AIActionApproval(user_id=user.id, action_type=kind, action_payload=payload, status="pending")
    db.add(row)
    db.flush()
    return {"id": str(row.id), "type": kind, "title": title, "description": description,
        "preview": preview, "confirm_label": confirm}


@router.post("/chat")
def chat(payload: ChatRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = db.get(AIConversation, payload.conversation_id) if payload.conversation_id else None
    if conversation and conversation.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    if not conversation:
        conversation = AIConversation(user_id=user.id, title=payload.message[:100])
        db.add(conversation)
        db.flush()
    db.add(AIMessage(conversation_id=conversation.id, role="user", content=payload.message))
    db.flush()
    calls, result, structured, pending = [], None, None, None
    suggestions = []
    provider = get_provider()
    if not provider:
        content = "The AI assistant is unavailable because no provider API key is configured. Business APIs remain available."
    else:
        history = db.query(AIMessage).filter(AIMessage.conversation_id == conversation.id).order_by(AIMessage.created_at).limit(30).all()
        prompt = _system_prompt() + "\nConversation:\n" + "\n".join(f"{m.role}: {m.content}" for m in history)
        try:
            structured = parse_assistant_payload(provider.complete(prompt))
        except Exception as exc:
            db.rollback()
            raise HTTPException(502, f"AI provider request failed ({type(exc).__name__})") from exc
        name = structured.get("tool")
        if not name:
            content = str(structured.get("answer", "I could not prepare a response."))[:8000]
        else:
            if name not in TOOL_NAMES:
                db.rollback()
                raise HTTPException(400, "AI requested an unsupported tool")
            args = structured.get("arguments") if isinstance(structured.get("arguments"), dict) else {}
            try:
                result = execute_tool(db, user, name, args)
                pending = _prepare_action(db, user, name, args, result)
                content = _summary(name, result)
                if pending:
                    content += " Nothing has been sent or created yet; an administrator must approve the action."
                calls = [{"id": f"tool_{uuid4().hex[:12]}", "name": name, "args": args,
                    "status": "success", "summary": _summary(name, result)}]
            except HTTPException as exc:
                content = str(exc.detail)
                result = {"error": content}
                calls = [{"id": f"tool_{uuid4().hex[:12]}", "name": name, "args": args,
                    "status": "error", "summary": content}]
            suggestions = ["Show overdue invoices", "What is our MRR?"]
    reply = {"id": str(uuid4()), "content": content, "tool_calls": calls,
        "data": _present(name, result) if provider and result and name else None,
        "pending_action": pending, "suggestions": suggestions}
    db.add(AIMessage(conversation_id=conversation.id, role="assistant", content=content,
        tool_calls={"calls": calls, "result": result} if calls else None))
    db.commit()
    return {"conversation_id": str(conversation.id), "reply": reply,
        "response": content, "tool_result": result, "structured_result": structured}


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = db.query(AIConversation).filter(AIConversation.id == conversation_id, AIConversation.user_id == user.id).first()
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    rows = db.query(AIMessage).filter(AIMessage.conversation_id == conversation_id).order_by(AIMessage.created_at).all()
    return {"id": str(conversation.id), "title": conversation.title,
        "messages": [{"id": str(row.id), "role": row.role, "content": row.content,
            "tool_calls": row.tool_calls, "created_at": row.created_at.isoformat() if row.created_at else None} for row in rows]}


def _review(db, approval_id, approve):
    row = db.query(AIActionApproval).filter(AIActionApproval.id == approval_id).with_for_update().first()
    if not row or row.status != "pending":
        raise HTTPException(404, "Action expired or already handled")
    created = row.created_at
    if created and created.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc) - timedelta(hours=24):
        row.status = "expired"
        db.commit()
        raise HTTPException(404, "Action expired or already handled")
    if not approve:
        row.status = "rejected"
        db.commit()
        return {"status": "rejected", "message": "Cancelled — nothing was sent or created."}
    action = row.action_payload or {}
    row.status = "approved"
    row.approved_at = datetime.now(timezone.utc)
    db.flush()
    if row.action_type == "generate_invoices":
        result = generate_due_invoices(db, date.fromisoformat(action.get("on_date", date.today().isoformat())),
            subscription_ids=action.get("subscription_ids", []))
        message = f"{result['created']} draft invoices created · {result['skipped']} skipped"
    elif row.action_type == "send_renewal_reminders":
        result = prepare_renewal_reminders(db, days=int(action.get("days", 30)),
            subscription_ids=action.get("subscription_ids", []))
        message = f"{result['sent']} renewal reminders sent"
    else:
        db.rollback()
        raise HTTPException(422, "Unsupported approval action")
    row.executed_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "completed", "message": message}


@router.post("/actions/{action_id}/approve")
def approve_prepared_action(action_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    return _review(db, action_id, True)


@router.post("/actions/{action_id}/reject")
def reject_prepared_action(action_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    return _review(db, action_id, False)


@router.post("/approve")
def approve_action(payload: ApprovalRequest, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    result = _review(db, payload.approval_id, payload.approve)
    return result | {"approval_id": str(payload.approval_id), "execution": result["status"], "result": None}
