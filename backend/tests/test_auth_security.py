from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.dependencies import require_roles
from app.core.security import create_access_token, decode_access_token


def test_role_dependency_allows_only_configured_roles():
    assert require_roles("admin")(current_user=SimpleNamespace(role="admin"))
    with pytest.raises(HTTPException) as exc:
        require_roles("admin")(current_user=SimpleNamespace(role="staff"))
    assert exc.value.status_code == 403


def test_access_token_contains_expiration_and_unique_id():
    payload = {"sub": "c6d974d2-19ec-4dad-a738-72f84eb4039e", "pwdv": "version"}
    first = decode_access_token(create_access_token(payload))
    second = decode_access_token(create_access_token(payload))
    assert first["exp"] > 0
    assert first["jti"] != second["jti"]
