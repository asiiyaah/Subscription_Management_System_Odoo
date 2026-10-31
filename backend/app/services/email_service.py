import smtplib
from email.message import EmailMessage

from app.core.config import settings


def send_password_reset_email(recipient: str, token: str) -> bool:
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        return False
    url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    message = EmailMessage()
    message["Subject"] = "Reset your SubscriptIQ password"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(f"Use this link within 30 minutes to reset your password. The link works once.\n\n{url}\n")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as client:
        client.ehlo()
        if settings.SMTP_STARTTLS:
            client.starttls()
            client.ehlo()
        if settings.SMTP_USERNAME:
            client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        client.send_message(message)
    return True


def send_invoice_email(recipient: str, invoice) -> bool:
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        return False
    lines = "\n".join(f"- {line.description or 'Item'} x {line.quantity}: {line.line_total}" for line in invoice.lines)
    message = EmailMessage()
    message["Subject"] = f"SubscriptIQ invoice {invoice.invoice_number}"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(
        f"Invoice: {invoice.invoice_number}\nDate: {invoice.invoice_date}\nDue: {invoice.due_date}\n\n"
        f"{lines}\n\nTotal: {invoice.total}\nPaid: {invoice.amount_paid}\nBalance due: {invoice.balance_due}\n"
    )
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as client:
        client.ehlo()
        if settings.SMTP_STARTTLS:
            client.starttls()
            client.ehlo()
        if settings.SMTP_USERNAME:
            client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        client.send_message(message)
    return True


def send_renewal_reminder_email(recipient: str, subscription) -> bool:
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        return False
    message = EmailMessage()
    message["Subject"] = f"Subscription {subscription.subscription_number} renewal reminder"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(
        f"Your subscription {subscription.subscription_number} is scheduled to end on {subscription.end_date}.\n"
        "Please contact us if you would like to renew.\n"
    )
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as client:
        client.ehlo()
        if settings.SMTP_STARTTLS:
            client.starttls()
            client.ehlo()
        if settings.SMTP_USERNAME:
            client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        client.send_message(message)
    return True
