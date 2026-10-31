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
    })
    assert report.status_code == 200, report.text
    report_data = report.json()
    assert report_data["summary"]["invoiced"] == 100.0
    assert report_data["summary"]["collected"] == 100.0
    assert report_data["summary"]["overdue_amount"] == 12.0
    assert report_data["summary"]["overdue_count"] == 1
    aging = {row["bucket"]: row for row in report_data["overdue_aging"]}
    assert aging["31–60 days"]["amount"] == 12.0
    assert [row["status"] for row in report_data["subscriptions_by_status"]] == [
        "draft", "quotation", "confirmed", "active", "paused", "closed",
    ]
    assert "outstanding_by_month" in report_data


def test_customer_portal_returns_404_for_other_customer_invoice(db_session, api_client):
    from app.core.security import hash_password
    from app.models.customer import Customer
    from app.models.invoice import Invoice
    from app.models.user import User

    own = Customer(name="Own", email=f"own-{uuid4().hex}@example.test")
    other = Customer(name="Other", email=f"other-{uuid4().hex}@example.test")
    db_session.add_all([own, other])
    db_session.flush()
    user = User(name="Own", email=own.email, password_hash=hash_password("StrongPass!2026"),
        role="customer", is_active=True, customer_id=own.id)
    invoice = Invoice(invoice_number=f"INV-ISO-{uuid4().hex[:12]}", customer_id=other.id,
        invoice_date=date.today(), due_date=date.today() + timedelta(days=15),
        status="open", subtotal=Decimal("10.00"), total=Decimal("10.00"), balance_due=Decimal("10.00"))
    db_session.add_all([user, invoice])
    db_session.commit()
    response = api_client.get(f"/api/portal/invoices/{invoice.id}", headers=_headers(user))
    assert response.status_code == 404
