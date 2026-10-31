from datetime import date, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.ai import llm_client
from app.ai.tools import execute_tool
from app.routers.invoices import _ui_status
from app.routers.payments import PaymentInput, _method
from app.routers.settings import BusinessSettingsPatch


@pytest.mark.parametrize("base,expected", [
    ("draft", "draft"), ("open", "confirmed"), ("sent", "confirmed"),
    ("partial", "confirmed"), ("confirmed", "confirmed"), ("paid", "paid"),
    ("cancelled", "cancelled"),
])
def test_invoice_status_adapter(base, expected):
    assert _ui_status(base) == expected


def test_payment_frontend_alias_and_date_input():
    payment = PaymentInput.model_validate({"invoice_id": "0baf3888-ecaa-4de2-9d32-443f0e27b9db",
        "amount": "12.30", "method": "bank_transfer", "payment_date": "2026-10-31"})
    assert payment.payment_method == "bank transfer"
    assert isinstance(payment.payment_date, datetime)
    assert _method(payment.payment_method) == "bank_transfer"


@pytest.mark.parametrize("patch", [
    {"gstin": "12ABCDE1234F1Z5"}, {"bank_ifsc": "HDFC0001234"},
])
def test_business_setting_tax_and_bank_identifiers(patch):
    assert BusinessSettingsPatch.model_validate(patch)


@pytest.mark.parametrize("patch", [
    {"gstin": "not-a-gstin"}, {"bank_ifsc": "bad-ifsc"},
])
def test_business_setting_rejects_invalid_identifiers(patch):
    with pytest.raises(ValueError):
        BusinessSettingsPatch.model_validate(patch)


def test_customer_cannot_use_admin_ai_tools():
    customer = SimpleNamespace(role="customer", customer_id="customer-1")
    with pytest.raises(HTTPException) as error:
        execute_tool(None, customer, "get_revenue_summary")
    assert error.value.status_code == 403


def test_unconfigured_or_placeholder_llm_provider_is_unavailable(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(llm_client.settings, "GEMINI_API_KEY", "your_actual_gemini_api_key")
    assert llm_client.get_provider() is None
