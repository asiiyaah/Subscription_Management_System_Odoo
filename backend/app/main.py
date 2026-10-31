from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import settings
from app.database.connection import get_db
from app.routers.auth import router as auth_router
from app.routers.products import router as products_router
from app.routers.plans import router as plans_router
from app.routers.customers import router as customers_router
from app.routers.subscriptions import router as subscriptions_router
from app.routers.invoices import router as invoices_router
from app.routers.payments import router as payments_router
from app.routers.taxes import router as taxes_router
from app.routers.discounts import router as discounts_router
from app.routers.quotation_templates import router as quotation_templates_router
from app.routers.analytics import router as analytics_router
from app.routers.reports import router as reports_router
from app.routers.portal import router as portal_router
from app.routers.users import router as users_router
from app.routers.settings import router as settings_router
from app.routers.ai import router as ai_router
from app.automation.jobs import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(products_router)
app.include_router(plans_router)
app.include_router(customers_router)
app.include_router(subscriptions_router)
app.include_router(invoices_router)
app.include_router(payments_router)
app.include_router(taxes_router)
app.include_router(discounts_router)
app.include_router(quotation_templates_router)
app.include_router(analytics_router)
app.include_router(reports_router)
app.include_router(portal_router)
app.include_router(users_router)
app.include_router(settings_router)
app.include_router(ai_router)


@app.get("/")
def root():
    return {
        "message": "Welcome to SubscriptIQ",
        "status": "running"
    }


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api/health/db")
def database_health(db: Session = Depends(get_db)):

    try:
        db.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected"
        }

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed"
        )
