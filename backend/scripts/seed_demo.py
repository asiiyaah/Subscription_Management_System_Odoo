"""Fill the database with realistic demo data for every frontend page.

Run from backend/ with the venv active:
    python -m scripts.seed_demo

- Uses the backend's own code paths (subscription pricing, lifecycle transitions, the billing run,
  payment recording), so totals, taxes, invoice numbers and statuses are exactly what the app produces.
- Dates are relative to today, so the data always looks current (overdue invoices, expiring subscriptions…).
- Safe to run twice: it stops if the demo customers already exist. Existing users are never changed.
"""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from app.core.security import hash_password
from app.database.connection import SessionLocal
from app.models.customer import Customer
from app.models.discount import Discount, DiscountProductRule
from app.models.invoice import Invoice
from app.models.plan import Plan
from app.models.product import Product, ProductAttribute, ProductAttributeValue, ProductTaxRule
from app.models.quotation import QuotationTemplate, QuotationTemplateLine
from app.models.settings import BusinessSetting
from app.models.tax import Tax
from app.models.user import User
from app.routers.subscriptions import LineInput, SubscriptionInput, create_subscription, subscription_action
from app.services.billing_service import generate_due_invoices
from app.services.payment_service import record_payment
from app.services.subscription_service import add_months

TODAY = date.today()
MARKER_EMAIL = "billing@acmeretail.in"  # first demo customer — if present, demo data is already loaded


def days(n: int) -> date:
    return TODAY + timedelta(days=n)


def at(d: date) -> datetime:
    return datetime.combine(d, time(10, 30), tzinfo=timezone.utc)


def main() -> None:
    db = SessionLocal()
    try:
        if db.query(Customer).filter(Customer.email == MARKER_EMAIL).first():
            print("Demo data is already in the database — nothing to do.")
            return

        # --- People who "do" the work ---------------------------------------------------
        admin = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).first()
        if not admin:
            admin = User(name="Admin", email="admin@subscriptiq.com", password_hash=hash_password("Admin@12345"),
                         role="admin", is_active=True)
            db.add(admin)
            db.commit()
            print("Created admin: admin@subscriptiq.com / Admin@12345")
        if not db.query(User).filter(User.email == "staff@subscriptiq.com").first():
            db.add(User(name="Riya Sharma", email="staff@subscriptiq.com", password_hash=hash_password("Staff@12345"),
                        role="staff", is_active=True))

        # --- Business settings ----------------------------------------------------------
        if not db.query(BusinessSetting).first():
            db.add(BusinessSetting(business_name="SubscriptIQ Technologies Pvt. Ltd.", email="billing@subscriptiq.com",
                                   phone="+91 80 4000 1234", address="91 Residency Road, Bengaluru, Karnataka 560025",
                                   currency="INR", timezone="Asia/Kolkata", invoice_prefix="INV", subscription_prefix="SUB",
                                   default_payment_terms=15, auto_generate_invoices=True, send_renewal_reminders=True,
                                   auto_close_expired=True))

        # --- Taxes (R23) ----------------------------------------------------------------
        has_default = db.query(Tax).filter(Tax.is_default.is_(True)).first() is not None
        gst18 = Tax(name="GST 18%", tax_type="percentage", rate=18, is_active=True, is_default=not has_default)
        gst12 = Tax(name="GST 12%", tax_type="percentage", rate=12, is_active=True, is_default=False)
        gst5 = Tax(name="GST 5%", tax_type="percentage", rate=5, is_active=False, is_default=False)
        cess = Tax(name="Digital services cess", tax_type="fixed", rate=25, is_active=True, is_default=False)
        db.add_all([gst18, gst12, gst5, cess])
        db.flush()

        # --- Products, variants, plans (R8–R14) ------------------------------------------
        def product(name, ptype, price, cost, description):
            p = Product(name=name, product_type=ptype, sales_price=price, cost_price=cost, description=description, status="active")
            db.add(p)
            db.flush()
            return p

        pm = product("Project Management Suite", "service", 499, 120, "Projects, tasks, timelines and team workload.")
        crm = product("CRM Cloud", "service", 1999, 450, "Leads, deals, pipelines and customer history.")
        storage = product("Cloud Storage 1 TB", "service", 299, 90, "Secure file storage with sharing and versioning.")
        support = product("Priority Support", "add-on", 199, 60, "4-hour response time and a named success manager.")
        seats = product("Extra Seats", "add-on", 149, 20, "Additional user seats for any workspace.")

        # Brief: "offered in variants, e.g. by brand, where choosing the Odoo brand adds 560 to the price".
        brand = ProductAttribute(product_id=pm.id, name="Brand")
        db.add(brand)
        db.flush()
        db.add_all([ProductAttributeValue(attribute_id=brand.id, value="Odoo", extra_price=560),
                    ProductAttributeValue(attribute_id=brand.id, value="Standard", extra_price=0)])
        db.add(ProductTaxRule(product_id=crm.id, tax_id=cess.id))  # CRM pays GST + digital services cess

        def plan(prod, name, price, period, *, min_qty=1, pausable=True, renewable=True, auto_close=False, early_close=True):
            p = Plan(product_id=prod.id, name=name, price=price, billing_period=period, billing_interval=1,
                     minimum_quantity=min_qty, is_pausable=pausable, is_renewable=renewable, auto_close=auto_close,
                     allows_early_closure=early_close, status="active", start_date=days(-365))
            db.add(p)
            db.flush()
            return p

        basic = plan(pm, "Basic Monthly", 499, "monthly")
        pro = plan(pm, "Pro Monthly", 999, "monthly")
        pro_year = plan(pm, "Pro Yearly", 9990, "yearly", pausable=False)
        business = plan(crm, "Business Monthly", 1999, "monthly", pausable=False, early_close=False)
        storage_m = plan(storage, "Storage Monthly", 299, "monthly", auto_close=True)
        support_m = plan(support, "Support Monthly", 199, "monthly")

        # --- Discounts (R27–R33): one in every status ------------------------------------
        def discount(code, name, dtype, value, *, min_qty=0, min_purchase=0, limit=None, used=0,
                     start=-120, end=None, active=True, products=()):
            d = Discount(code=code, name=name, discount_type=dtype, value=value, minimum_quantity=min_qty,
                         minimum_purchase=min_purchase, usage_limit=limit, usage_count=used, is_active=active,
                         valid_from=at(days(start)), valid_until=at(days(end)) if end is not None else None)
            d.product_rules = [DiscountProductRule(product_id=p.id) for p in products]
            db.add(d)
            db.flush()
            return d

        seats10 = discount("SEATS10", "10% off for 5+ seats", "percentage", 10, min_qty=5, limit=100, used=21)
        welcome = discount("WELCOME500", "₹500 off first invoice", "fixed", 500, min_purchase=1999, limit=200, used=86, end=30)
        discount("CRM20", "20% off CRM Cloud", "percentage", 20, start=-10, end=5, used=6, products=[crm])
        discount("DIWALI25", "Festive 25% off", "percentage", 25, min_purchase=999, limit=500, start=7, end=21)
        discount("SUPPORT50", "50% off Priority Support", "percentage", 50, start=-90, end=-15, used=41, products=[support])
        discount("EARLYBIRD", "Early bird ₹1,000 off", "fixed", 1000, min_purchase=4999, limit=50, used=50, start=-200)
        discount("PARTNER15", "Partner programme 15%", "percentage", 15, min_qty=10, used=3, start=-30, active=False,
                 products=[pm, storage])

        # --- Quotation templates (R15, R16) ------------------------------------------------
        for name, validity, lines in [
            ("Startup bundle", 30, [(pm, pro, 5, 999), (support, support_m, 1, 199)]),
            ("Sales team starter", 15, [(crm, business, 3, 1999), (storage, storage_m, 1, 299)]),
        ]:
            t = QuotationTemplate(name=name, validity_days=validity, payment_terms="Net 15", status="active",
                                  description=f"Pre-built offer: {name.lower()}.")
            t.lines = [QuotationTemplateLine(product_id=p.id, plan_id=pl.id, quantity=q, unit_price=price) for p, pl, q, price in lines]
            db.add(t)
        db.commit()
        print("Settings, taxes, products, plans, discounts and templates created.")

        # --- Customers -------------------------------------------------------------------
        def customer(name, email, phone, address, city, state, pin):
            c = Customer(name=name, email=email, phone=phone, company=name, address=address, city=city, state=state,
                         postal_code=pin, country="India", is_active=True)
            db.add(c)
            db.flush()
            return c

        acme = customer("Acme Retail", MARKER_EMAIL, "+91 98450 11223", "12 MG Road", "Bengaluru", "Karnataka", "560001")
        nova = customer("Nova Labs", "accounts@novalabs.io", "+91 98490 22334", "4th Floor, Cyber Towers", "Hyderabad", "Telangana", "500081")
        pixel = customer("Pixel Studio", "hello@pixelstudio.in", "+91 98200 33445", "22 Linking Road", "Mumbai", "Maharashtra", "400050")
        green = customer("Green Grocers", "finance@greengrocers.in", "+91 98410 44556", "8 Anna Salai", "Chennai", "Tamil Nadu", "600002")
        urban = customer("Urban Fitness", "admin@urbanfitness.in", "+91 98300 55667", "17 Park Street", "Kolkata", "West Bengal", "700016")
        zen = customer("Zen Clinic", "ops@zenclinic.in", "+91 98220 66778", "3 FC Road", "Pune", "Maharashtra", "411004")
        bluefin = customer("Bluefin Logistics", "ap@bluefin.co.in", "+91 98110 77889", "Plot 9, Sector 18", "Gurugram", "Haryana", "122015")
        kochi = customer("Kochi Coffee Co.", "billing@kochicoffee.in", "+91 98470 88990", "45 Marine Drive", "Kochi", "Kerala", "682031")

        # Portal login for Acme Retail (R6) — log in to /portal as this customer.
        if not db.query(User).filter(User.email == "customer@acmeretail.in").first():
            db.add(User(name="Acme Retail", email="customer@acmeretail.in", password_hash=hash_password("Customer@12345"),
                        role="customer", is_active=True, customer_id=acme.id))
        db.commit()
        print("8 customers created.")

        # --- Subscriptions through the real create + lifecycle code -------------------------
        def subscribe(cust, lines, *, months_ago=0, status="active", discount_obj=None, end_in=None, then=None, valid_days=None):
            start = add_months(TODAY, -months_ago) if months_ago else TODAY
            payload = SubscriptionInput(
                customer_id=cust.id,
                lines=[LineInput(product_id=p.id, plan_id=pl.id, quantity=Decimal(q)) for p, pl, q in lines],
                start_date=start,
                end_date=days(end_in) if end_in is not None else None,
                discount_id=discount_obj.id if discount_obj else None,
                status="quotation" if status == "quotation" else "draft",
                quotation_valid_until=days(valid_days) if valid_days else None,
            )
            sub = create_subscription(payload, db=db, user=admin)
            steps = {"draft": [], "quotation": [], "confirmed": ["confirm"], "active": ["confirm", "activate"]}[status]
            for action in steps + (then or []):
                sub = subscription_action(UUID(sub["id"]), action, db=db, user=admin)
            return sub

        active_subs = [
            subscribe(acme, [(pm, basic, 1), (support, support_m, 1)], months_ago=4),
            subscribe(nova, [(pm, pro, 5)], months_ago=5, discount_obj=seats10),
            subscribe(pixel, [(crm, business, 2)], months_ago=3),
            subscribe(green, [(storage, storage_m, 3)], months_ago=4, end_in=12),
            subscribe(urban, [(pm, pro, 10)], months_ago=2, discount_obj=seats10, end_in=5),
            subscribe(bluefin, [(crm, business, 5), (support, support_m, 1)], months_ago=5, discount_obj=welcome),
            subscribe(acme, [(crm, business, 1)], months_ago=1, end_in=3),
            subscribe(pixel, [(pm, pro_year, 3)], months_ago=11),  # yearly — first invoice next month
            subscribe(zen, [(pm, basic, 2)], months_ago=3),        # paused after its invoices
            subscribe(kochi, [(storage, storage_m, 1)], months_ago=4),  # closed after its invoices
        ]
        subscribe(nova, [(crm, business, 3)], status="quotation", valid_days=20)
        subscribe(bluefin, [(storage, storage_m, 10)], status="quotation", valid_days=10)
        subscribe(kochi, [(pm, basic, 1)], status="draft")
        subscribe(green, [(support, support_m, 1)], status="confirmed")
        print(f"{len(active_subs) + 4} subscriptions created.")

        # --- Billing run: one pass bills one period per subscription, so repeat to catch up ----
        total_created = 0
        for _ in range(12):
            result = generate_due_invoices(db, TODAY)
            total_created += result["created"]
            if result["created"] == 0:
                break
        print(f"{total_created} invoices generated by the billing run.")

        # Now pause / close two of them (their past invoices stay).
        subscription_action(UUID(active_subs[8]["id"]), "pause", db=db, user=admin)
        subscription_action(UUID(active_subs[9]["id"]), "close", db=db, user=admin)

        # --- Payments (R34): realistic mix of paid, part-paid, overdue and not yet due ----------
        methods = ["upi", "bank transfer", "card", "upi", "cash", "cheque"]
        leave_overdue = {pixel.id, urban.id, bluefin.id}   # their latest past-due invoice stays unpaid
        part_pay = {zen.id}                                 # latest past-due invoice half paid
        early_payers = {nova.id, green.id}                  # pay before the due date
        invoices = db.query(Invoice).order_by(Invoice.invoice_date, Invoice.invoice_number).all()
        latest_past_due = {}
        for inv in invoices:
            if inv.due_date < TODAY:
                latest_past_due[inv.customer_id] = inv.id

        paid = partial = 0
        for i, inv in enumerate(invoices):
            past_due = inv.due_date < TODAY
            is_latest = latest_past_due.get(inv.customer_id) == inv.id
            if past_due and is_latest and inv.customer_id in leave_overdue:
                continue
            if not past_due and inv.customer_id not in early_payers:
                continue
            amount = Decimal(str(inv.balance_due))
            if past_due and is_latest and inv.customer_id in part_pay:
                amount = (amount / 2).quantize(Decimal("0.01"))
                partial += 1
            else:
                paid += 1
            pay_day = min(TODAY, inv.invoice_date + timedelta(days=3 + i % 9))
            record_payment(db, invoice_id=inv.id, amount=amount, payment_method=methods[i % len(methods)],
                           created_by=admin.id, payment_reference=f"PAY-{inv.invoice_number[-8:]}",
                           note="UTR " + str(410000 + i * 37) if i % 3 == 0 else None, payment_date=at(pay_day))
        print(f"{paid} invoices paid in full, {partial} part-paid; the rest are open or overdue.")

        print("\nDone. Logins:")
        print("  staff    staff@subscriptiq.com / Staff@12345")
        print("  customer customer@acmeretail.in / Customer@12345  (portal: Acme Retail)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
