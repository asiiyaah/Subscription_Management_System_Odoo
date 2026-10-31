from fastapi import FastAPI

app = FastAPI(
    title="SubscriptIQ API",
    description="AI-powered Subscription Management System",
    version="1.0.0"
)


@app.get("/")
def root():
    return {
        "message": "Welcome to SubscriptIQ API",
        "status": "running"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }