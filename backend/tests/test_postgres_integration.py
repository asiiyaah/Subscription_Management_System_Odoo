from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

def _admin(db):
    from app.core.security import hash_password
    from app.models.user import User
    user = User(name="Test Admin", email=f"admin-{uuid4().hex}@example.test", password_hash=hash_password("SecurePass!2026"),
        role="admin", is_active=True)
    db.add(user)
    db.commit()
    return user


def _headers(user):
    from app.core.security import create_access_token, password_token_version
    token = create_access_token({"sub": str(user.id), "role": user.role,
        "pwdv": password_token_version(user.password_hash)})
    return {"Authorization": f"Bearer {token}"}


def test_customer_signup_duplicate_login_and_current_user(api_client):
    body = {"name": "New Customer", "email": f"new-{uuid4().hex}@example.com", "password": "StrongPass!2026"}
    response = api_client.post("/api/auth/signup", json=body)
    assert response.status_code == 201
    assert api_client.post("/api/auth/signup", json=body).status_code == 409
    login = api_client.post("/api/auth/login", json={"email": body["email"], "password": body["password"]})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = api_client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["role"] == "customer"


def test_product_plan_variant_and_pricing_preview(db_session, api_client):
    admin = _admin(db_session)
    headers = _headers(admin)
    product_response = api_client.post("/api/products", headers=headers, json={
        "name": "Integration Service", "product_type": "service", "sales_price": 10,
        "attributes": [{"name": "Tier", "values": [{"value": "Plus", "extra_price": 2.5}]}],
    })
    assert product_response.status_code == 201, product_response.text
    product = product_response.json()
    variant = product["attributes"][0]["values"][0]
    plan_response = api_client.post("/api/plans", headers=headers, json={
        "product_id": product["id"], "name": "Monthly Plan", "billing_period": "monthly",
        "price": 10, "minimum_quantity": 2,
    })
    assert plan_response.status_code == 201, plan_response.text
    tax_response = api_client.post("/api/taxes", headers=headers, json={
        "name": "Integration GST", "type": "percentage", "rate": 18,
        "applies_to": "all", "product_ids": [], "is_default": True, "active": True,
    })
    assert tax_response.status_code == 201, tax_response.text
    assert tax_response.json()["is_default"] is True
    assert isinstance(api_client.get("/api/taxes", headers=headers).json(), list)
    discount_response = api_client.post("/api/discounts", headers=headers, json={
        "name": "Integration discount", "code": f"TEST{uuid4().hex[:8].upper()}",
        "type": "percentage", "value": 10, "min_purchase": 20, "min_quantity": 2,
        "usage_limit": 1, "applies_to": "subscription", "product_ids": [], "active": True,
    })
    assert discount_response.status_code == 201, discount_response.text
    discount = discount_response.json()
    invalid_discount = api_client.post("/api/discounts/validate", headers=headers, json={
        "code": discount["code"], "subtotal": 19, "quantity": 3, "product_ids": [product["id"]],
    })
    assert invalid_discount.status_code == 200
    assert invalid_discount.json()["valid"] is False
    valid_discount = api_client.post("/api/discounts/validate", headers=headers, json={
        "code": discount["code"], "subtotal": 37.5, "quantity": 3, "product_ids": [product["id"]],
    })
    assert valid_discount.json()["valid"] is True
    from app.models.customer import Customer
    customer = Customer(name="Preview Customer", email=f"preview-{uuid4().hex}@example.com", is_active=True)
    db_session.add(customer)
    db_session.commit()
    preview = api_client.post("/api/subscriptions/preview", headers=headers, json={
        "customer_id": str(customer.id),
        "lines": [{"product_id": product["id"], "plan_id": plan_response.json()["id"],
            "product_attribute_value_id": variant["id"], "quantity": 3}],
        "discount_id": discount["id"],
    })
    assert preview.status_code == 200, preview.text
    assert Decimal(preview.json()["subtotal"]) == Decimal("37.50")
    assert Decimal(preview.json()["discount_total"]) == Decimal("3.75")
    assert Decimal(preview.json()["tax_total"]) == Decimal("6.08")
    assert Decimal(preview.json()["total"]) == Decimal("39.83")


def test_due_invoice_idempotency_confirmation_and_partial_payments(db_session, api_client):
    from app.models.customer import Customer
    from app.models.invoice import Invoice
    from app.models.subscription import Subscription

    admin = _admin(db_session)
    customer = Customer(name="Billing Customer", email="billing@example.test", is_active=True)
    db_session.add(customer)
    db_session.flush()
    sub = Subscription(subscription_number=f"SUB-TEST-{uuid4().hex[:12]}", customer_id=customer.id, status="active",
        start_date=date.today(), next_billing_date=date.today(), billing_period="monthly",
        billing_interval=1, subtotal=Decimal("100.00"), discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"), total=Decimal("100.00"))
    db_session.add(sub)
    db_session.commit()
    headers = _headers(admin)

    first = api_client.post("/api/invoices/generate-due", headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["created"] == 1
    invoice_id = first.json()["invoice_ids"][0]
    second = api_client.post("/api/invoices/generate-due", headers=headers)
    assert second.status_code == 200
    assert second.json()["created"] == 0
    assert second.json()["skipped"] == 0

    confirmed = api_client.post(f"/api/invoices/{invoice_id}/confirm", headers=headers)
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed"
    partial = api_client.post("/api/payments", headers=headers, json={
        "invoice_id": invoice_id, "amount": "40.00", "payment_date": date.today().isoformat(),
        "method": "bank_transfer", "note": "first part",
    })
    assert partial.status_code == 201, partial.text
    assert partial.json()["balance"] == 60.0
    invalid = api_client.post("/api/payments", headers=headers, json={
        "invoice_id": invoice_id, "amount": "61.00", "payment_date": date.today().isoformat(), "method": "cash",
    })
    assert invalid.status_code == 422
    paid = api_client.post("/api/payments", headers=headers, json={
        "invoice_id": invoice_id, "amount": "60.00", "payment_date": date.today().isoformat(), "method": "cash",
    })
    assert paid.status_code == 201
    assert paid.json()["status"] == "paid"
    assert paid.json()["balance"] == 0.0

    overdue_invoice = Invoice(invoice_number=f"INV-OVERDUE-{uuid4().hex[:10]}", customer_id=customer.id,
        invoice_date=date.today() - timedelta(days=40), due_date=date.today() - timedelta(days=35),
        status="open", subtotal=Decimal("12.00"), total=Decimal("12.00"),
        amount_paid=Decimal("0.00"), balance_due=Decimal("12.00"))
    db_session.add(overdue_invoice)
    db_session.commit()

    report = api_client.get("/api/reports", headers=headers, params={
        "date_from": date.today().replace(day=1).isoformat(), "date_to": date.today().isoformat(),
        "customer_id": str(customer.id),
    })
    assert report.status_code == 200, report.text
    report_data = report.json()
    assert report_data["summary"]["invoiced"] == 100.0
    assert report_data["summary"]["collected"] == 100.0
    assert report_data["summary"]["overdue_amount"] == 12.0
    assert report_data["summary"]["overdue_count"] == 1
    aging = {row["bucket"]: row for row in report_data["overdue_aging"]}
    assert aging["31–60 days"]["amount"] == 12.0
    assert report_data["payment_timing"] == [
        {"bucket": "0–7 days", "count": 2, "amount": 100.0},
        {"bucket": "8–15 days", "count": 0, "amount": 0.0},
        {"bucket": "16–30 days", "count": 0, "amount": 0.0},
        {"bucket": "31+ days", "count": 0, "amount": 0.0},
    ]
    assert report_data["avg_days_to_pay"] == 0.0
    assert [row["status"] for row in report_data["subscriptions_by_status"]] == [
        "draft", "quotation", "confirmed", "active", "paused", "closed",
    ]
    assert "outstanding_by_month" in report_data


def test_customer_portal_returns_404_for_other_customer_invoice(db_session, api_client):
    from app.core.security import hash_password
    from app.models.customer import Customer
    from app.models.invoice import Invoice
    from app.models.user import User
    from app.models.product import Product
    from app.models.plan import Plan
    from app.models.subscription import Subscription, SubscriptionLine

    own = Customer(name="Own", email=f"own-{uuid4().hex}@example.test")
    other = Customer(name="Other", email=f"other-{uuid4().hex}@example.test")
    db_session.add_all([own, other])
    db_session.flush()
    user = User(name="Own", email=own.email, password_hash=hash_password("StrongPass!2026"),
        role="customer", is_active=True, customer_id=own.id)
    product = Product(name="Portal Plan Product", product_type="service", sales_price=Decimal("25.00"), status="active")
    db_session.add(product)
    db_session.flush()
    plan = Plan(product_id=product.id, name="Portal Monthly Plan", billing_period="monthly",
        billing_interval=1, price=Decimal("25.00"), minimum_quantity=1, status="active")
    db_session.add(plan)
    db_session.flush()
    subscription = Subscription(subscription_number=f"SUB-PORTAL-{uuid4().hex[:8]}", customer_id=own.id,
        status="active", start_date=date.today(), next_billing_date=date.today() + timedelta(days=30),
        billing_period="monthly", billing_interval=1, subtotal=Decimal("25.00"),
        discount_total=Decimal("0.00"), tax_total=Decimal("0.00"), total=Decimal("25.00"))
    invoice = Invoice(invoice_number=f"INV-ISO-{uuid4().hex[:12]}", customer_id=other.id,
        invoice_date=date.today(), due_date=date.today() + timedelta(days=15),
        status="open", subtotal=Decimal("10.00"), total=Decimal("10.00"), balance_due=Decimal("10.00"))
    db_session.add_all([user, subscription, invoice])
    db_session.flush()
    db_session.add(SubscriptionLine(subscription_id=subscription.id, product_id=product.id, plan_id=plan.id,
        description="Portal Monthly Plan", quantity=1, unit_price=Decimal("25.00"), line_total=Decimal("25.00")))
    db_session.commit()
    portal_subs = api_client.get("/api/portal/subscriptions", headers=_headers(user))
    assert portal_subs.status_code == 200, portal_subs.text
    assert portal_subs.json()["items"][0]["plan_name"] == "Portal Monthly Plan"
    assert portal_subs.json()["items"][0]["total"] == 25.0
    response = api_client.get(f"/api/portal/invoices/{invoice.id}", headers=_headers(user))
    assert response.status_code == 404


def test_invoice_sort_by_customer_name(db_session, api_client):
    from app.models.customer import Customer
    from app.models.invoice import Invoice

    admin = _admin(db_session)
    zulu = Customer(name="Zulu Customer", email=f"zulu-{uuid4().hex}@example.test", is_active=True)
    alpha = Customer(name="Alpha Customer", email=f"alpha-{uuid4().hex}@example.test", is_active=True)
    db_session.add_all([zulu, alpha])
    db_session.flush()
    for customer in (zulu, alpha):
        db_session.add(Invoice(invoice_number=f"INV-{uuid4().hex[:12]}", customer_id=customer.id,
            invoice_date=date.today(), due_date=date.today() + timedelta(days=15), status="open",
            subtotal=Decimal("10.00"), total=Decimal("10.00"), amount_paid=Decimal("0.00"),
            balance_due=Decimal("10.00")))
    db_session.commit()
    response = api_client.get("/api/invoices", headers=_headers(admin), params={
        "sort_by": "customer_name", "sort_dir": "asc", "page_size": 100,
    })
    assert response.status_code == 200, response.text
    names = [row["customer_name"] for row in response.json()["items"]]
    assert names.index("Alpha Customer") < names.index("Zulu Customer")


def test_ai_no_key_reply_and_conversation_ownership(db_session, api_client, monkeypatch):
    from app.models.user import User
    from app.routers import ai as ai_router
    from app.core.security import hash_password

    owner = _admin(db_session)
    outsider = User(name="AI Other", email=f"ai-other-{uuid4().hex}@example.test",
        password_hash=hash_password("StrongPass!2026"), role="staff", is_active=True)
    db_session.add(outsider)
    db_session.commit()
    monkeypatch.setattr(ai_router, "get_provider", lambda: None)
    response = api_client.post("/api/ai/chat", headers=_headers(owner), json={"message": "What is our MRR?"})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["conversation_id"]
    assert "unavailable" in payload["reply"]["content"]
    assert payload["reply"]["tool_calls"] == []
    assert payload["response"] == payload["reply"]["content"]
    history = api_client.get(f"/api/ai/conversations/{payload['conversation_id']}", headers=_headers(owner))
    assert history.status_code == 200
    assert [message["role"] for message in history.json()["messages"]] == ["user", "assistant"]
    forbidden = api_client.get(f"/api/ai/conversations/{payload['conversation_id']}", headers=_headers(outsider))
    assert forbidden.status_code == 404


def test_ai_executes_multiple_database_tools(db_session, api_client, monkeypatch):
    from app.ai.provider import ProviderTurn, ToolCall
    from app.routers import ai as ai_router

    class FakeProvider:
        name = "test"
        def __init__(self):
            self.turn = 0
        def respond(self, messages, tools, *, timeout=None):
            self.turn += 1
            if self.turn == 1:
                return ProviderTurn(tool_calls=[ToolCall("call_mrr", "get_revenue_summary", {}),
                    ToolCall("call_plan", "get_revenue_by_plan", {})])
            return ProviderTurn(content="I checked the requested business data.")

    admin = _admin(db_session)
    monkeypatch.setattr(ai_router, "get_provider", lambda: FakeProvider())
    response = api_client.post("/api/ai/chat", headers=_headers(admin), json={
        "message": "What is our MRR and which plan earns the most?",
    })
    assert response.status_code == 200, response.text
    reply = response.json()["reply"]
    assert [call["name"] for call in reply["tool_calls"]] == ["get_revenue_summary", "get_revenue_by_plan"]
    assert all(call["status"] == "success" for call in reply["tool_calls"])
    assert reply["data"]["kind"] == "bar_chart"


def test_ai_customer_invoice_tool_is_scoped_to_own_customer(api_client, db_session, monkeypatch):
    from app.core.security import hash_password
    from app.models.customer import Customer
    from app.models.invoice import Invoice
    from app.models.user import User
    from app.ai.provider import ProviderTurn, ToolCall
    from app.routers import ai as ai_router

    own = Customer(name="AI Own", email=f"ai-own-{uuid4().hex}@example.test")
    other = Customer(name="AI Other Customer", email=f"ai-customer-other-{uuid4().hex}@example.test")
    db_session.add_all([own, other])
    db_session.flush()
    user = User(name="AI Own", email=own.email, password_hash=hash_password("StrongPass!2026"),
        role="customer", is_active=True, customer_id=own.id)
    own_invoice = Invoice(invoice_number=f"INV-AI-OWN-{uuid4().hex[:8]}", customer_id=own.id,
        invoice_date=date.today(), due_date=date.today(), status="open", subtotal=Decimal("10.00"),
        total=Decimal("10.00"), amount_paid=Decimal("0.00"), balance_due=Decimal("10.00"))
    other_invoice = Invoice(invoice_number=f"INV-AI-OTHER-{uuid4().hex[:8]}", customer_id=other.id,
        invoice_date=date.today(), due_date=date.today(), status="open", subtotal=Decimal("99.00"),
        total=Decimal("99.00"), amount_paid=Decimal("0.00"), balance_due=Decimal("99.00"))
    db_session.add_all([user, own_invoice, other_invoice])
    db_session.commit()

    class FakeProvider:
        name = "test"
        def __init__(self): self.turn = 0
        def respond(self, messages, tools, *, timeout=None):
            self.turn += 1
            if self.turn == 1:
                return ProviderTurn(tool_calls=[ToolCall("own_invoice_list", "get_invoices", {"status": "open"})])
            return ProviderTurn(content="Here are your open invoices.")

    monkeypatch.setattr(ai_router, "get_provider", lambda: FakeProvider())
    response = api_client.post("/api/ai/chat", headers=_headers(user), json={"message": "Show my open invoices"})
    assert response.status_code == 200, response.text
    rows = response.json()["reply"]["data"]["rows"]
    assert {row["number"] for row in rows} == {own_invoice.invoice_number}
    assert other_invoice.invoice_number not in str(response.json())


def test_ai_invoice_action_requires_admin_approval_and_cannot_be_replayed(db_session, api_client, monkeypatch):
    from app.ai.provider import ProviderTurn, ToolCall
    from app.core.security import hash_password
    from app.models.customer import Customer
    from app.models.invoice import Invoice
    from app.models.subscription import Subscription
    from app.models.user import User
    from app.routers import ai as ai_router
    import app.ai.tools as ai_tools
    from app.services.billing_service import preview_due_invoices as real_preview

    admin = _admin(db_session)
    staff = User(name="AI Staff", email=f"ai-staff-{uuid4().hex}@example.test",
        password_hash=hash_password("StrongPass!2026"), role="staff", is_active=True)
    customer = Customer(name="AI Billing", email=f"ai-billing-{uuid4().hex}@example.test", is_active=True)
    db_session.add_all([staff, customer])
    db_session.flush()
    sub = Subscription(subscription_number=f"SUB-AI-{uuid4().hex[:10]}", customer_id=customer.id,
        status="active", start_date=date.today(), next_billing_date=date.today(),
        billing_period="monthly", billing_interval=1, subtotal=Decimal("25.00"),
        discount_total=Decimal("0.00"), tax_total=Decimal("0.00"), total=Decimal("25.00"))
    db_session.add(sub)
    db_session.commit()
    sub_id = str(sub.id)
    monkeypatch.setattr(ai_tools, "preview_due_invoices", lambda session, on_date=None:
        [row for row in real_preview(session, on_date) if row["subscription_id"] == sub_id])

    class FakeProvider:
        name = "test"
        def __init__(self): self.turn = 0
        def respond(self, messages, tools, *, timeout=None):
            self.turn += 1
            if self.turn == 1:
                return ProviderTurn(tool_calls=[ToolCall("draft_preview", "create_invoice_drafts", {"dry_run": True})])
            return ProviderTurn(content="The invoice is ready for administrator approval.")

    monkeypatch.setattr(ai_router, "get_provider", lambda: FakeProvider())
    chat = api_client.post("/api/ai/chat", headers=_headers(admin), json={"message": "Generate the due invoice"})
    assert chat.status_code == 200, chat.text
    action = chat.json()["reply"]["pending_action"]
    assert action["type"] == "generate_invoices"
    assert db_session.query(Invoice).filter(Invoice.subscription_id == sub.id).count() == 0

    denied = api_client.post(f"/api/ai/actions/{action['id']}/approve", headers=_headers(staff))
    assert denied.status_code == 403
    approved = api_client.post(f"/api/ai/actions/{action['id']}/approve", headers=_headers(admin))
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "completed"
    assert "1 draft invoice" in approved.json()["message"]
    assert db_session.query(Invoice).filter(Invoice.subscription_id == sub.id).count() == 1
    replay = api_client.post(f"/api/ai/actions/{action['id']}/approve", headers=_headers(admin))
    assert replay.status_code == 404


def test_ai_reminder_action_can_be_rejected_once(db_session, api_client, monkeypatch):
    from app.ai.provider import ProviderTurn, ToolCall
    from app.models.customer import Customer
    from app.models.subscription import Subscription
    from app.routers import ai as ai_router

    admin = _admin(db_session)
    customer = Customer(name="AI Renewal", email=f"ai-renewal-{uuid4().hex}@example.test", is_active=True)
    db_session.add(customer)
    db_session.flush()
    sub = Subscription(subscription_number=f"SUB-AI-REM-{uuid4().hex[:10]}", customer_id=customer.id,
        status="active", start_date=date.today(), end_date=date.today() + timedelta(days=5),
        billing_period="monthly", billing_interval=1, subtotal=Decimal("15.00"),
        discount_total=Decimal("0.00"), tax_total=Decimal("0.00"), total=Decimal("15.00"))
    db_session.add(sub)
    db_session.commit()

    class FakeProvider:
        name = "test"
        def __init__(self): self.turn = 0
        def respond(self, messages, tools, *, timeout=None):
            self.turn += 1
            if self.turn == 1:
                return ProviderTurn(tool_calls=[ToolCall("renewal_preview", "prepare_renewal_reminders", {"days": 7})])
            return ProviderTurn(content="I prepared the reminders for review.")

    monkeypatch.setattr(ai_router, "get_provider", lambda: FakeProvider())
    response = api_client.post("/api/ai/chat", headers=_headers(admin), json={"message": "Prepare renewal reminders for the next week"})
    assert response.status_code == 200, response.text
    action = response.json()["reply"]["pending_action"]
    assert action["type"] == "send_renewal_reminders"
    rejected = api_client.post(f"/api/ai/actions/{action['id']}/reject", headers=_headers(admin))
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    replay = api_client.post(f"/api/ai/actions/{action['id']}/reject", headers=_headers(admin))
    assert replay.status_code == 404
