"""Authentication endpoints matching the frontend JSON API contract.

Onboarding rules:
- Admin: created at setup (scripts/seed_demo.py or a one-off command). No sign-up.
- Staff: an admin invites them (email link, 48 h) or sets a temporary password (must be changed at first login).
- Customers: sign up themselves (linked to an existing customer record with the same email) or are invited.
- Optional: REQUIRE_EMAIL_VERIFICATION makes customers confirm their email before logging in.
"""

import hashlib
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user, oauth2_scheme
from app.core.security import create_access_token, hash_password, verify_password, password_token_version, decode_access_token
from app.database.connection import get_db
from app.models.customer import Customer
from app.models.user import PasswordResetToken, RevokedToken, User
from app.services.email_service import send_password_reset_email, send_verification_email
from app.schemas.user import (
    AuthResponse,
    ChangePasswordRequest,
    ChangePasswordResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    UserResponse,
    VerifyEmailRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
RESET_TTL = timedelta(minutes=30)
UNVERIFIED_DETAIL = "Please confirm your email address first — we've sent you a link."


def _token_ttl(purpose: str) -> timedelta:
    return RESET_TTL if purpose == "reset" else timedelta(hours=settings.INVITE_LINK_TTL_HOURS)


def _issue_token(user: User) -> str:
    return create_access_token({"sub": str(user.id), "role": user.role, "pwdv": password_token_version(user.password_hash)})


@router.get("/me", response_model=UserResponse)
def current_user(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token: str = Depends(oauth2_scheme), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    db.add(RevokedToken(user_id=current_user.id, jti=payload["jti"],
        expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc)))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_password_reset_token(db: Session, user: User, purpose: str = "reset") -> str:
    """Issue a single-use token: "reset" (30 min), "invite" or "verify" (INVITE_LINK_TTL_HOURS).

    Older unused tokens of the same purpose are revoked.
    """
    now = datetime.now(timezone.utc)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id, PasswordResetToken.purpose == purpose,
        PasswordResetToken.used_at.is_(None)).update({PasswordResetToken.used_at: now}, synchronize_session=False)
    raw_token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(user_id=user.id, token_hash=_token_digest(raw_token), purpose=purpose,
        expires_at=now + _token_ttl(purpose)))
    return raw_token


def _consume_token(db: Session, raw_token: str, purposes: set[str]) -> tuple[PasswordResetToken, User] | None:
    now = datetime.now(timezone.utc)
    record = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == _token_digest(raw_token),
        PasswordResetToken.purpose.in_(purposes),
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > now,
    ).first()
    if not record:
        return None
    user = db.query(User).filter(User.id == record.user_id, User.is_active.is_(True)).first()
    if not user:
        return None
    record.used_at = now
    return record, user


def _send_verification(db: Session, user: User) -> None:
    token = create_password_reset_token(db, user, "verify")
    db.commit()
    try:
        if not send_verification_email(user.email, token, user.name):
            logger.warning("Verification link created for user %s but SMTP is not configured", user.id)
    except (OSError, smtplib.SMTPException) as exc:
        logger.error("Verification email failed for user %s: %s", user.id, type(exc).__name__)


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    if db.query(User.id).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    # If the team already created this customer (same email, no portal login yet), link to that record
    # so the new account immediately sees its subscriptions and invoices.
    customer = db.query(Customer).filter(Customer.email.ilike(email)).first()
    if customer and customer.portal_user is None:
        customer.phone = customer.phone or payload.phone
        customer.company = customer.company or payload.company
    else:
        customer = Customer(name=payload.name.strip(), email=email, phone=payload.phone, company=payload.company)

    verification_required = settings.REQUIRE_EMAIL_VERIFICATION
    user = User(
        name=payload.name.strip(), email=email, password_hash=hash_password(payload.password),
        role="customer", is_active=True, customer=customer,
        email_verified_at=None if verification_required else datetime.now(timezone.utc),
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc
    if verification_required:
        _send_verification(db, user)
    return SignupResponse(user=UserResponse.model_validate(user), verification_required=verification_required)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been disabled. Contact your admin.")
    if settings.REQUIRE_EMAIL_VERIFICATION and user.role == "customer" and not user.email_verified_at:
        raise HTTPException(status_code=403, detail=UNVERIFIED_DETAIL)
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    return AuthResponse(access_token=_issue_token(user), user=UserResponse.model_validate(user))


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # (Message wording from asiiyaah's f939fa9 — tells the user when the server can't send email.)
    email_configured = bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)
    message = ("If this email is registered, a password reset link has been requested. If it does not arrive, check spam or contact your administrator."
        if email_configured else
        "If this email is registered, a reset link was created, but email delivery is not configured on the server. Contact your administrator to complete the reset.")
    user = db.query(User).filter(User.email == str(payload.email).lower(), User.is_active.is_(True)).first()
    if user:
        raw_token = create_password_reset_token(db, user, "reset")
        db.commit()
        try:
            if not send_password_reset_email(user.email, raw_token):
                logger.warning("Password reset link created for user %s but SMTP is not configured", user.id)
        except (OSError, smtplib.SMTPException) as exc:
            logger.error("Password reset email delivery failed for user %s: %s", user.id, type(exc).__name__)
    return MessageResponse(message=message)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Used by both "forgot password" links and invitation links (set your first password)."""
    consumed = _consume_token(db, payload.token, {"reset", "invite"})
    if not consumed:
        raise HTTPException(status_code=400, detail="This link is invalid or has expired. Request a new link.")
    record, user = consumed
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    # Opening a link sent to this address proves the user owns it.
    user.email_verified_at = user.email_verified_at or datetime.now(timezone.utc)
    now = datetime.now(timezone.utc)
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.id != record.id,
        PasswordResetToken.purpose.in_(["reset", "invite"]),
        PasswordResetToken.used_at.is_(None),
    ).update({PasswordResetToken.used_at: now}, synchronize_session=False)
    db.commit()
    if record.purpose == "invite":
        return MessageResponse(message="Your account is ready. Log in with your new password.")
    return MessageResponse(message="Your password has been reset. You can now log in.")


@router.post("/change-password", response_model=ChangePasswordResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if verify_password(payload.new_password, current_user.password_hash):
        raise HTTPException(status_code=422, detail="Choose a password different from your current one.")
    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    db.commit()
    db.refresh(current_user)
    # Old tokens stop working once the password changes; hand back a fresh one so the user stays signed in.
    return ChangePasswordResponse(message="Password changed successfully.", access_token=_issue_token(current_user),
        user=UserResponse.model_validate(current_user))


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    consumed = _consume_token(db, payload.token, {"verify"})
    if not consumed:
        raise HTTPException(status_code=400, detail="This confirmation link is invalid or has expired. Request a new one.")
    _, user = consumed
    user.email_verified_at = user.email_verified_at or datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="Your email is confirmed. You can now log in.")


@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(payload: ResendVerificationRequest, db: Session = Depends(get_db)):
    message = "If this account still needs confirming, we've sent a new link."
    user = db.query(User).filter(User.email == str(payload.email).lower(), User.is_active.is_(True)).first()
    if user and not user.email_verified_at:
        _send_verification(db, user)
    return MessageResponse(message=message)
