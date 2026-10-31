from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.subscription_service import next_billing_date, transition_subscription


class RecordingSession:
    def __init__(self):
        self.added = []

    def add(self, value):
        self.added.append(value)


def test_billing_date_month_end_and_yearly_interval():
    assert next_billing_date(date(2025, 1, 31), "monthly") == date(2025, 2, 28)
    assert next_billing_date(date(2024, 2, 29), "yearly") == date(2025, 2, 28)


def test_status_transition_records_history_and_first_billing_date():
    db = RecordingSession()
    sub = SimpleNamespace(status="confirmed", start_date=None, next_billing_date=None,
        billing_period="monthly", billing_interval=1, lines=[], end_date=None, id="sub-id")
    transition_subscription(db, sub, "active", user_id="user-id")
    assert sub.status == "active"
    assert sub.next_billing_date is not None
    assert db.added[0].previous_status == "confirmed"
    assert db.added[0].new_status == "active"


def test_invalid_transition_is_rejected():
    sub = SimpleNamespace(status="draft", lines=[])
    with pytest.raises(HTTPException) as exc:
        transition_subscription(RecordingSession(), sub, "paused")
    assert exc.value.status_code == 409


def test_trial_days_delay_first_billing_date():
    db = RecordingSession()
    plan = SimpleNamespace(is_pausable=True, is_renewable=True, trial_days=14)
    line = SimpleNamespace(plan=plan)
    sub = SimpleNamespace(status="confirmed", start_date=date(2025, 1, 1), next_billing_date=None,
        billing_period="monthly", billing_interval=1, lines=[line], end_date=None, id="sub-id")
    transition_subscription(db, sub, "active", user_id="user-id")
    assert sub.next_billing_date == date(2025, 1, 15)
