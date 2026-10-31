import smtplib
from email.message import EmailMessage

from app.core.config import settings


def email_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)


def _deliver(recipient: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns False (without raising) when SMTP isn't configured."""
    if not email_configured():
        return False
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as client:
        client.ehlo()
        if settings.SMTP_STARTTLS:
            client.starttls()
            client.ehlo()
        if settings.SMTP_USERNAME:
            client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        client.send_message(message)
    return True


def _link(path: str, token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}?token={token}"


def send_password_reset_email(recipient: str, token: str) -> bool:
    return _deliver(
        recipient,
        "Reset your SubscriptIQ password",
        "We received a request to reset your password.\n\n"
        f"Use this link within 30 minutes. It works once:\n{_link('/reset-password', token)}\n\n"
        "If you didn't ask for this, you can ignore this email — your password won't change.\n",
    )


def send_invite_email(recipient: str, token: str, name: str, *, customer: bool = False) -> bool:
    """Invitation to a new staff member or a customer's portal: they choose their own password."""
    hours = settings.INVITE_LINK_TTL_HOURS
    what = "your customer portal, where you can see your subscriptions and invoices" if customer else "the SubscriptIQ team workspace"
    return _deliver(
        recipient,
        "You're invited to SubscriptIQ",
        f"Hi {name},\n\nYou've been invited to {what}.\n\n"
        f"Set your password to get started (link valid for {hours} hours, works once):\n"
        f"{_link('/accept-invite', token)}\n",
    )


def send_verification_email(recipient: str, token: str, name: str) -> bool:
    hours = settings.INVITE_LINK_TTL_HOURS
    return _deliver(
        recipient,
        "Confirm your email for SubscriptIQ",
        f"Hi {name},\n\nThanks for signing up. Please confirm your email address (link valid for {hours} hours):\n"
        f"{_link('/verify-email', token)}\n",
    )


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


def send_overdue_invoice_reminder_email(recipient: str, invoice) -> bool:
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        return False
    message = EmailMessage()
    message["Subject"] = f"Payment reminder for invoice {invoice.invoice_number}"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(
        f"Invoice {invoice.invoice_number} was due on {invoice.due_date}.\n"
        f"Outstanding balance: {invoice.balance_due}\n\n"
        "Please contact us if you have already made this payment.\n"
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
