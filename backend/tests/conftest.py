import os

import pytest

_run_neon = os.getenv("RUN_NEON_INTEGRATION_TESTS", "").strip().lower() in {"1", "true", "yes"}

if _run_neon:
    from sqlalchemy.engine import make_url
    from app.core.config import settings

    database_url = make_url(settings.DATABASE_URL)
    if settings.APP_ENV.lower() != "development" or not (database_url.host or "").lower().endswith(".neon.tech"):
        raise RuntimeError("Neon integration tests require APP_ENV=development and a Neon database URL.")
    # Prevent background jobs and external delivery from running during DB-backed API tests.
    settings.ENABLE_AUTOMATION = False
    settings.AUTO_GENERATE_DUE_INVOICES = False
    settings.AUTO_CLOSE_EXPIRED_SUBSCRIPTIONS = False
    settings.AI_PROVIDER = "none"
    settings.GEMINI_API_KEY = ""
    settings.OPENAI_API_KEY = ""
    settings.SMTP_HOST = ""
    settings.SMTP_USERNAME = ""
    settings.SMTP_PASSWORD = ""
    settings.SMTP_FROM_EMAIL = ""
    settings.SECRET_KEY = "temporary-neon-integration-test-key"


@pytest.fixture
def neon_test_connection():
    if not _run_neon:
        pytest.skip("Set RUN_NEON_INTEGRATION_TESTS=1 to run transaction-isolated tests on the configured Neon development database.")
    from sqlalchemy import text
    from app.database.connection import engine

    connection = engine.connect()
    transaction = connection.begin()
    try:
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        if revision != "9f4ac18e2d71":
            raise RuntimeError(f"Neon schema is not at the expected test revision: {revision}")
        yield connection
    finally:
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture
def db_session(neon_test_connection):
    from sqlalchemy.orm import Session

    session = Session(bind=neon_test_connection, expire_on_commit=False,
        join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def api_client(neon_test_connection):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session
    from app.database.connection import get_db
    from app.main import app

    def override_get_db():
        session = Session(bind=neon_test_connection, expire_on_commit=False,
            join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)
