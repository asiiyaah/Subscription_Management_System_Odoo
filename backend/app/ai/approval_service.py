"""Prepare and execute persistent, administrator-approved AI actions."""

import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.activity import ActivityLog
from app.models.ai import AIActionApproval
from app.models.invoice import Invoice
from app.models.user import User
from app.services.billing_service import generate_due_invoices
from app.services.email_service import send_overdue_invoice_reminder_email
from app.services.reminder_service import prepare_renewal_reminders

logger = logging.getLogger(__name__)


def prepare_action(db: Session, user: User, tool_name: str, arguments: dict, result: dict):
    action_type = None
    payload: dict = {}
    preview = []
    if tool_name == "create_invoice_drafts":
        ready = [row for row in result.get("items", []) if row.get("status") == "ready"]
        if not ready:
            return None
        action_type = "generate_invoices"
        payload = {"on_date": date.today().isoformat(),
            "subscription_ids": [row["subscription_id"] for row in ready]}
        preview = [{"label": f"{row.get('customer_name', '')} · {row.get('subscription_number', '')}",
            "detail": f"{row.get('plan_name', '')} · ₹{row.get('estimated_total', '0')}"} for row in ready]
        title = f"Create {len(ready)} draft invoice{'s' if len(ready) != 1 else ''}"
        description = "Review these billing periods and backend-calculated amounts before creating drafts."
        confirm_label = "Approve & create"
    elif tool_name == "prepare_renewal_reminders":
        rows = result.get("prepared", [])
        if not rows:
            return None
        action_type = "send_renewal_reminders"
        payload = {"days": int(arguments.get("days", 30)),
            "subscription_ids": [row["subscription_id"] for row in rows]}
        preview = [{"label": f"{row.get('customer_name', '')} · {row.get('customer_email', '')}",
            "detail": f"{row.get('plan_name', '')} ({row.get('subscription_number', '')}) ends {row.get('end_date', '')}"}
            for row in rows]
        title = f"Send {len(rows)} renewal reminder{'s' if len(rows) != 1 else ''}"
        description = "Emails will be sent to the customers shown here after an administrator approves."
        confirm_label = "Approve & send"
    elif tool_name == "prepare_overdue_reminders":
        rows = result.get("items", [])
        if not rows:
            return None
        action_type = "send_overdue_reminders"
        payload = {"invoice_ids": [row["invoice_id"] for row in rows]}
        preview = [{"label": f"{row.get('customer_name', '')} · {row.get('customer_email', '')}",
            "detail": f"{row.get('number', '')} due {row.get('due_date', '')} · balance ₹{row.get('balance', '0')}"}
            for row in rows]
        title = f"Send {len(rows)} overdue payment reminder{'s' if len(rows) != 1 else ''}"
        description = "Review the overdue invoices before the reminder emails are sent."
        confirm_label = "Approve & send"
    else:
        return None

    approval = AIActionApproval(user_id=user.id, action_type=action_type,
        action_payload=payload, status="pending")
    db.add(approval)
    db.flush()
    return {"id": str(approval.id), "type": action_type, "title": title,
        "description": description, "preview": preview, "confirm_label": confirm_label}


def _send_overdue_reminders(db: Session, invoice_ids: list[str]) -> dict:
    sent = skipped = failed = 0
    for raw_id in invoice_ids:
        try:
            invoice_id = UUID(raw_id)
            invoice = (db.query(Invoice).options(joinedload(Invoice.customer))
                .filter(Invoice.id == invoice_id).with_for_update().first())
            if (not invoice or invoice.status not in {"open", "sent", "partial", "confirmed"}
                    or invoice.due_date >= date.today() or (invoice.balance_due or 0) <= 0
                    or not invoice.customer or not invoice.customer.email):
                skipped += 1
                continue
            if not send_overdue_invoice_reminder_email(invoice.customer.email, invoice):
                failed += 1
                continue
            db.add(ActivityLog(action="overdue_invoice_reminder_sent", entity_type="invoice",
                entity_id=invoice.id, description=f"AI-approved overdue reminder sent for {invoice.invoice_number}"))
            db.commit()
            sent += 1
        except Exception as exc:
            logger.warning("AI-approved overdue reminder failed (%s)", type(exc).__name__)
            db.rollback()
            failed += 1
    return {"sent": sent, "skipped": skipped, "failed": failed}


def review_action(db: Session, action_id: UUID, *, approve: bool, actor: User | None = None) -> dict:
    approval = (db.query(AIActionApproval).filter(AIActionApproval.id == action_id)
        .with_for_update().first())
    if not approval or approval.status != "pending":
        raise HTTPException(404, "Action expired or already handled")
    if not approve and actor and actor.role != "admin" and approval.user_id != actor.id:
        raise HTTPException(403, "Only the action creator or an administrator can reject this action")
    created_at = approval.created_at
    if created_at:
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if created_at < datetime.now(timezone.utc) - timedelta(hours=24):
            approval.status = "expired"
            db.commit()
            raise HTTPException(404, "Action expired or already handled")
    if not approve:
        approval.status = "rejected"
        db.commit()
        return {"status": "rejected", "message": "Cancelled — nothing was sent or created."}

    action_type = approval.action_type
    payload = approval.action_payload or {}
    # Commit the single-use decision before side effects so a parallel approver cannot replay it.
    approval.status = "approved"
    approval.approved_at = datetime.now(timezone.utc)
    db.commit()
    try:
        if action_type == "generate_invoices":
            result = generate_due_invoices(db, date.fromisoformat(payload.get("on_date", date.today().isoformat())),
                subscription_ids=payload.get("subscription_ids", []))
            message = f"{result['created']} draft invoices created · {result['skipped']} skipped"
        elif action_type == "send_renewal_reminders":
            result = prepare_renewal_reminders(db, days=int(payload.get("days", 30)),
                subscription_ids=payload.get("subscription_ids", []))
            message = f"{result['sent']} renewal reminders sent"
            if result.get("failed"):
                message += f" · {result['failed']} failed"
        elif action_type == "send_overdue_reminders":
            result = _send_overdue_reminders(db, payload.get("invoice_ids", []))
            message = f"{result['sent']} overdue reminders sent"
            if result.get("skipped"):
                message += f" · {result['skipped']} no longer eligible"
            if result.get("failed"):
                message += f" · {result['failed']} failed"
        else:
            raise HTTPException(422, "Unsupported approval action")
    except HTTPException:
        failed = db.query(AIActionApproval).filter(AIActionApproval.id == action_id).first()
        if failed:
            failed.status = "failed"
            db.commit()
        raise
    except Exception as exc:
        logger.exception("Approved AI action failed action=%s type=%s", action_id, action_type)
        db.rollback()
        failed = db.query(AIActionApproval).filter(AIActionApproval.id == action_id).first()
        if failed:
            failed.status = "failed"
            db.commit()
        raise HTTPException(502, "The approved action could not be completed. Review the business records and prepare it again.") from exc
    completed = db.query(AIActionApproval).filter(AIActionApproval.id == action_id).first()
    if completed:
        completed.executed_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": "completed", "message": message}

