from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token, password_token_version
from app.database.connection import get_db
from app.models.user import User, RevokedToken

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# While a temporary password is in use, only these endpoints work.
PASSWORD_CHANGE_ALLOWED = {"/api/auth/me", "/api/auth/change-password", "/api/auth/logout"}


def get_current_user(request: Request, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_access_token(token)
        user_id = UUID(payload.get("sub", ""))
        password_version = payload.get("pwdv")
        token_id = payload.get("jti")
        token_expiry = payload.get("exp")
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise invalid
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not password_version or password_version != password_token_version(user.password_hash) or not token_id or not token_expiry:
        raise invalid
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been disabled. Contact your admin.")
    if db.query(RevokedToken.id).filter(RevokedToken.jti == token_id).first():
        raise invalid
    if user.must_change_password and request.url.path.rstrip("/") not in PASSWORD_CHANGE_ALLOWED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
            detail="Please set a new password before continuing.")
    return user


def require_roles(*allowed_roles: str):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action")
        return current_user
    return role_checker
