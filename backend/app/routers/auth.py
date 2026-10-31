"""Authentication endpoints matching the frontend JSON API contract."""

import hashlib
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, oauth2_scheme
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password, password_token_version, decode_access_token
from app.database.connection import get_db
from app.models.customer import Customer
from app.models.user import PasswordResetToken, RevokedToken, User
from app.services.email_service import send_password_reset_email
from app.schemas.user import (
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    UserResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
RESET_TTL = timedelta(minutes=30)


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


def create_password_reset_token(db: Session, user: User) -> str:
    """Issue a single-use reset/invitation token using the shared password-reset flow."""
    now = datetime.now(timezone.utc)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None)).update({PasswordResetToken.used_at: now}, synchronize_session=False)
    raw_token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(user_id=user.id, token_hash=_token_digest(raw_token), expires_at=now + RESET_TTL))
    return raw_token


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    if db.query(User.id).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    customer = Customer(name=payload.name.strip(), email=email, phone=payload.phone, company=payload.company)
    user = User(
        name=payload.name.strip(), email=email, password_hash=hash_password(payload.password),
        role="customer", is_active=True, customer=customer,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc
    return SignupResponse(user=UserResponse.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been disabled. Contact your admin.")
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    token = create_access_token({"sub": str(user.id), "role": user.role, "pwdv": password_token_version(user.password_hash)})
    return AuthResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email_configured = bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)
    message = ("If this email is registered, a password reset link has been requested. If it does not arrive, check spam or contact your administrator."
        if email_configured else
        "If this email is registered, a reset link was created, but email delivery is not configured on the server. Contact your administrator to complete the reset.")
    user = db.query(User).filter(User.email == str(payload.email).lower(), User.is_active.is_(True)).first()
    if user:
        raw_token = create_password_reset_token(db, user)
        db.commit()
        try:
            delivered = send_password_reset_email(user.email, raw_token)
            if not delivered:
                logger.warning("Password reset link created for user %s but SMTP is not configured", user.id)
        except (OSError, smtplib.SMTPException) as exc:
            logger.error("Password reset email delivery failed for user %s: %s", user.id, type(exc).__name__)
    return MessageResponse(message=message)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    reset = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == _token_digest(payload.token),
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > now,
    ).first()
    if not reset:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or has expired. Request a new link.")
    user = db.query(User).filter(User.id == reset.user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or has expired. Request a new link.")
    user.password_hash = hash_password(payload.new_password)
    reset.used_at = now
    # Revoke other reset links as well.
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.id != reset.id,
        PasswordResetToken.used_at.is_(None),
    ).update({PasswordResetToken.used_at: now}, synchronize_session=False)
    db.commit()
    return MessageResponse(message="Your password has been reset. You can now log in.")


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Password changed successfully.")
