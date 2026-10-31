from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from decimal import Decimal

from app.models.invoice import Invoice, InvoiceLine, InvoiceLineTax
from app.models.product import ProductTaxRule
from app.models.settings import BusinessSetting
from app.models.subscription import Subscription, SubscriptionLine
from app.models.tax import Tax
from app.services.pricing_service import money
from app.services.subscription_service import roll_billing_date
from app.services.activity_service import log_activity


def due_subscriptions(db: Session, on_date: date | None = None):
    on_date = on_date or date.today()
    return (db.query(Subscription)
        .filter(Subscription.status == "active", Subscription.next_billing_date <= on_date)
        .order_by(Subscription.next_billing_date, Subscription.id).all())


def preview_due_invoices(db: Session, on_date: date | None = None):
    rows = due_subscriptions(db, on_date)
    output = []
    for sub in rows:
        period = sub.next_billing_date
        exists = db.query(Invoice.id).filter(Invoice.subscription_id == sub.id, Invoice.invoice_date == period).first()
        output.append({"subscription_id": str(sub.id), "subscription_number": sub.subscription_number,
            "customer_id": str(sub.customer_id), "invoice_date": period.isoformat(),
            "total": str(sub.total or 0), "already_invoiced": bool(exists)})
    return output


def generate_due_invoices(db: Session, on_date: date | None = None):
    on_date = on_date or date.today()
    rows = due_subscriptions(db, on_date)
    created = skipped = 0
    for candidate in rows:
        try:
            # Serialize concurrent workers on each subscription. The invoice unique index is the final guard.
            sub = (db.query(Subscription).options(selectinload(Subscription.lines))
                   .filter(Subscription.id == candidate.id).with_for_update().first())
            if not sub or sub.status != "active" or not sub.next_billing_date or sub.next_billing_date > on_date:
                skipped += 1
                continue
            period = sub.next_billing_date
            exists = db.query(Invoice.id).filter(Invoice.subscription_id == sub.id, Invoice.invoice_date == period).first()
            if exists:
                roll_billing_date(sub, period)
                db.commit()
                skipped += 1
                continue
            settings = db.query(BusinessSetting).first()
            prefix = settings.invoice_prefix if settings and settings.invoice_prefix else "INV"
            terms = settings.default_payment_terms if settings and settings.default_payment_terms is not None else 15
            invoice = Invoice(invoice_number=f"{prefix}-{period:%Y%m%d}-{uuid4().hex[:8].upper()}",
                customer_id=sub.customer_id, subscription_id=sub.id, invoice_date=period,
                due_date=period + timedelta(days=terms), status="open", subtotal=sub.subtotal or 0,
                discount_total=sub.discount_total or 0, tax_total=sub.tax_total or 0,
                total=sub.total or 0, amount_paid=0, balance_due=sub.total or 0, notes=sub.notes)
            for line in sub.lines:
                invoice_line = InvoiceLine(product_id=line.product_id, description=line.description,
                    quantity=line.quantity or 1, unit_price=line.unit_price, discount_amount=line.discount_amount or 0,
                    tax_amount=line.tax_amount or 0, line_total=line.line_total)
                tax_ids = [r[0] for r in db.query(ProductTaxRule.tax_id).filter(ProductTaxRule.product_id == line.product_id).all()]
                tax_query = db.query(Tax).filter(Tax.is_active.is_(True))
                tax_query = tax_query.filter((Tax.id.in_(tax_ids)) | Tax.is_default.is_(True)) if tax_ids else tax_query.filter(Tax.is_default.is_(True))
                taxable = max(Decimal("0"), Decimal(str(line.unit_price)) * Decimal(str(line.quantity or 1)) - Decimal(str(line.discount_amount or 0)))
                for tax in tax_query.all():
                    amount = money(taxable * Decimal(str(tax.rate)) / Decimal("100")) if tax.tax_type == "percentage" else money(Decimal(str(tax.rate)) * Decimal(str(line.quantity or 1)))
                    invoice_line.taxes.append(InvoiceLineTax(tax_id=tax.id, tax_name_snapshot=tax.name,
                        tax_rate_snapshot=tax.rate, tax_amount=amount))
                invoice.lines.append(invoice_line)
            db.add(invoice)
            roll_billing_date(sub, period)
            db.flush()
            log_activity(db, action="invoice_generated", entity_type="invoice", entity_id=invoice.id,
                description=f"Generated invoice {invoice.invoice_number} for subscription {sub.subscription_number}")
            db.commit()
            created += 1
        except IntegrityError:
            db.rollback()
            skipped += 1
        except Exception:
            db.rollback()
            raise
    return {"created": created, "skipped": skipped}
