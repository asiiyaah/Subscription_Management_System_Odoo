from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_and_required_api_routes_are_registered():
    with TestClient(app) as client:
        assert client.get("/api/health").json() == {"status": "healthy"}
    paths = app.openapi()["paths"]
    assert "/api/auth/login" in paths
    assert "/api/subscriptions/preview" in paths
    assert "/api/invoices/due-preview" in paths
    assert "/api/invoices/generate-due" in paths
    assert "/api/portal/invoices/{invoice_id}" in paths
