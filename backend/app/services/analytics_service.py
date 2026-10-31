from decimal import Decimal

from app.models.subscription import Subscription


def monthly_recurring_revenue(db):
    rows = db.query(Subscription).filter(Subscription.status == "active").all()
    total = Decimal("0")
    for sub in rows:
        amount = Decimal(str(sub.total or 0))
        interval = max(int(sub.billing_interval or 1), 1)
        period = (sub.billing_period or "monthly").lower()
        if period == "daily":
            total += amount * Decimal(365) / Decimal(12 * interval)
        elif period == "weekly":
            total += amount * Decimal(52) / Decimal(12 * interval)
        elif period == "yearly":
            total += amount / Decimal(12 * interval)
        else:
            total += amount / interval
    return {"mrr": str(total.quantize(Decimal("0.01")))}
