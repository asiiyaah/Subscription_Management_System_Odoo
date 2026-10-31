# SubscriptIQ Backend API

Verified 2026-10-31 against FastAPI OpenAPI (80 paths). Interactive Swagger is at `/docs`; the schema is at `/openapi.json`.

## Shared conventions

- API routes use the `/api` prefix. Protected routes use `Authorization: Bearer <access_token>`.
- Roles are `admin`, `staff`, and `customer`; admin-only operations enforce role checks in the backend.
- Database UUIDs are serialized as strings. Financial arithmetic uses `Decimal`; JSON monetary values remain numbers where the frontend TypeScript contracts require numbers.
- Dates use `YYYY-MM-DD`, datetimes use ISO 8601, and validation errors use FastAPI's `{ "detail": ... }` format.
- Paginated resources use `{items, total, page, page_size}` unless the resource description states otherwise.
- Customer requests are scoped by the authenticated user's linked `customer_id`.

## Health and authentication

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/`, `/api/health` | Public | Application health |
| GET | `/api/health/db` | Public | Database probe |
| POST | `/api/auth/signup` | Public | Creates a customer account; caller cannot choose a privileged role |
| POST | `/api/auth/login` | Public | JSON email/password login; updates `last_login` |
| GET | `/api/auth/me` | Authenticated | Current user |
| POST | `/api/auth/logout` | Authenticated | Revokes current token |
| POST | `/api/auth/forgot-password` | Public | Non-enumerating reset request |
| POST | `/api/auth/reset-password` | Public | Consumes single-use reset/invitation token |
| POST | `/api/auth/change-password` | Authenticated | Changes password and invalidates old password-version tokens |

Password reset and invitations require SMTP for delivery. With SMTP unset, the API remains available and logs delivery status without disclosing account existence.

## Products, plans, customers, and quotations

- Products: `GET/POST /api/products`, `GET/PATCH/PUT/DELETE /api/products/{product_id}`, `GET /api/products/options`.
- Product attributes and values: `POST /api/products/{product_id}/attributes`; `PATCH/DELETE /api/products/{product_id}/attributes/{attribute_id}`; `POST /api/products/{product_id}/attributes/{attribute_id}/values`; `PATCH/DELETE /api/products/{product_id}/attributes/{attribute_id}/values/{value_id}`; `PUT/DELETE /api/product-attribute-values/{value_id}`. Product taxes: `GET/PUT /api/products/{product_id}/taxes`.
- Plans: `GET/POST /api/plans`, `GET/PATCH/DELETE /api/plans/{plan_id}`. Supported periods are daily, weekly, monthly, yearly; filters include status, product, and search.
- Customers (admin/staff): `GET/POST /api/customers`, `GET/PATCH/PUT/DELETE /api/customers/{customer_id}`, `POST /api/customers/{customer_id}/invite`. Detail returns linked subscriptions, invoices, payments, and activity.
- Quotation templates (admin/staff): `GET/POST /api/quotation-templates`, `GET/PUT/DELETE /api/quotation-templates/{template_id}`. Subscription creation from template: `POST /api/subscriptions/from-template`.

## Taxes and discounts

- Taxes: `GET/POST /api/taxes`, `PATCH/PUT/DELETE /api/taxes/{tax_id}`, `POST /api/taxes/{tax_id}/default`. Supports percentage and fixed rates plus product rules. The default tax cannot be deactivated/deleted until another tax is made default.
- Discounts: `GET/POST /api/discounts`, `GET /api/discounts/counts`, `PATCH/PUT/DELETE /api/discounts/{discount_id}`, `POST /api/discounts/validate`. Validation covers active dates, codes, product applicability, minimum amount/quantity, and usage limit. Used discounts cannot be deleted.

## Subscriptions and pricing

- `GET/POST /api/subscriptions`, `POST /api/subscriptions/preview`, `GET/PATCH /api/subscriptions/{subscription_id}`, `POST /api/subscriptions/{subscription_id}/{action}`.
- Actions: `confirm`, `activate`, `pause`, `resume`, `renew`, `close`. State changes are validated and written to subscription history.
- Preview/create pricing resolve product prices, variant additions, quantity, applicable taxes, and discounts on the server. Client prices and totals are not trusted.

## Invoices and payments

- Invoices: `GET /api/invoices`, `GET /api/invoices/summary`, `GET /api/invoices/due-preview`, `POST /api/invoices/generate-due`, `GET /api/invoices/{invoice_id}`, `POST /api/invoices/{invoice_id}/confirm`, `/send`, `/cancel`.
- Invoice listing accepts `status`, `overdue`, `customer_id`, `subscription_id`, `q`/`search`, `sort_by`, `sort_dir`, `page`, and `page_size`. `status=confirmed` includes open, sent, partial, and confirmed database states. Detail includes lines, tax/discount breakdown, and payment history.
- Due preview is read-only. Generation creates draft invoices, locks subscriptions, and relies on a unique subscription/billing-period key for idempotency. Response: `{created, skipped, invoice_ids}`.
- Payments: `GET/POST /api/payments`, `GET /api/payments/summary`, `GET /api/payments/{payment_id}`. Listing accepts search, method, date range, customer/invoice, sort, and pagination. Methods include cash, bank transfer, UPI, card, cheque. Payment creation returns the updated invoice; overpayment is 422 and draft/cancelled invoice payment is 409.

## Analytics and reports

- Analytics: `GET /api/analytics/summary`, `/revenue-over-time`, `/revenue-by-plan`, `/expiring-subscriptions`, `/recent-activity`.
- Combined report: `GET /api/reports` accepts inclusive `date_from`, `date_to`, `plan` (plan name) or `plan_id`, and `customer_id`. It returns summary, monthly and plan revenue, six subscription statuses, subscriptions (max 100), monthly/method/payment detail, payment timing, outstanding by month, overdue aging, and overdue invoices. Date filters apply to financial flows; point-in-time subscription and balance fields respect plan/customer filters.
- Dropdown data: `GET /api/reports/options` returns active plan names and customers.
- Existing raw reports remain: `GET /api/reports/subscriptions`, `/payments`, `/revenue`, `/overdue-invoices`; `export=true` returns CSV where supported.

## Portal, users, and settings

- Portal routes require a linked customer account: `GET/PATCH /api/portal/profile`, `GET /api/portal/summary`, `GET /api/portal/subscriptions`, `GET /api/portal/subscriptions/{subscription_id}`, `POST /api/portal/subscriptions/{subscription_id}/{action}`, `GET /api/portal/invoices`, `GET /api/portal/invoices/{invoice_id}`, `GET /api/portal/payments`. Draft invoices are hidden and cross-customer records return 404.
- Business details readable to any authenticated account: `GET /api/settings/business`.
- Users (admin only): `GET/POST /api/users`, `GET /api/users/counts`, `PATCH /api/users/{user_id}`, `POST /api/users/{user_id}/password-reset`. User listing omits customers by default; `active`, role, search, and pagination filters are available. `send_invite=true` uses the reset-token flow.
- Settings: `GET/PATCH /api/settings` (admin/staff read; admin write), `GET/PATCH /api/settings/profile`. Business settings include GSTIN, bank details, invoice schedule, renewal reminder interval, and overdue reminder interval; GSTIN and IFSC are validated.

## AI assistant

- `POST /api/ai/chat`, `GET /api/ai/conversations/{conversation_id}`, `POST /api/ai/actions/{action_id}/approve`, `/reject`, and backward-compatible `POST /api/ai/approve`.
- AI can only use allowlisted ORM/service tools. Consequential invoice/reminder actions are stored for administrator approval. No configured provider key produces a valid unavailable reply rather than blocking the rest of the API.

## Environment and startup

Configure `backend/.env` using `backend/.env.example`: `DATABASE_URL`, `SECRET_KEY`; optional `APP_ENV`, `DEBUG`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `FRONTEND_URL`, `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_STARTTLS`, `ENABLE_AUTOMATION`, `AUTO_GENERATE_DUE_INVOICES`, and `AUTO_CLOSE_EXPIRED_SUBSCRIPTIONS`.

PowerShell, from `backend`:

```powershell
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Migrations are managed only through Alembic. Check the target before applying pending migrations with `python -m alembic current` and `python -m alembic upgrade head`.

## Contract-source notes

The checked-in frontend contracts for invoices, reports, and AI were reviewed alongside `frontend/src/types`. The referenced `API_SETTINGS_PORTAL_CONTRACT.md`, `API_USERS_CONTRACT.md`, and `BACKEND_INTEGRATION.md` files are not present in this checkout; those areas were checked against the API routers and available TypeScript types instead.
