import pytest
from pydantic import ValidationError

from app.schemas.user import SignupRequest, ResetPasswordRequest


def test_signup_accepts_strong_password_and_normalizes_name():
    payload = SignupRequest(name="  Asha Menon ", email="asha@example.com", password="Abcdefg@1")
    assert payload.name == "Asha Menon"


@pytest.mark.parametrize("password", ["abcdefgh@1", "ABCDEFGH@1", "Abcdefg1", "Abc@1234"])
def test_password_policy_rejects_weak_password(password):
    with pytest.raises(ValidationError):
        SignupRequest(name="Asha", email="asha@example.com", password=password)


def test_reset_password_enforces_same_policy():
    with pytest.raises(ValidationError):
        ResetPasswordRequest(token="x" * 24, new_password="abcdefgh1")
