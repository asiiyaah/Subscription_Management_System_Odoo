# SubscriptIQ Backend API

Generated against FastAPI OpenAPI on 2026-10-31. Interactive Swagger UI is available at `/docs` when the server is running; the schema is at `/openapi.json`.

## Conventions

- Feature routes are under `/api` and require `Authorization: Bearer <access_token>` unless noted.
- UUID identifiers are serialized as strings.
- Paginated staff lists return `{items, total, page, page_size}`. Portal and some report endpoints return `{items, count}` or `{items}` as described by their routes.
- Validation errors use FastAPI's standard `detail` response.
- Money is calculated with Python `Decimal`; clients should render returned totals and not recalculate them.
- Roles are `admin`, `staff`, and `customer`. Admin owns restricted settings and user management. Staff has operational access. Customer-facing subscription, invoice, payment, and profile reads are scoped to `User.customer_id`.

## Health

| Method | Path | Access |
| --- | --- | --- |
| GET | `/` | Public |
| GET | `/api/health` | Public |
| GET | `/api/health/db` | Public; database probe |

## Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | Customer registration; returns `{user}` |
| POST | `/api/auth/login` | JSON email/password login; returns bearer token and user |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Persist token revocation |
| POST | `/api/auth/forgot-password` | Non-enumerating reset email request |
| POST | `/api/auth/reset-password` | Consume one-use, 30-minute reset token |
| POST | `/api/auth/change-password` | Authenticated password change; prior tokens become invalid |

Password policy: more than eight characters with uppercase, lowercase, and special characters. Configure SMTP variables to deliver reset links and portal invites.

## Catalog and customers

- Products: `GET/POST /api/products`, `GET/PATCH/DELETE /api/products/{product_id}`. Search uses `q`; list supports `status`, `page`, and `page_size`. Product attributes and values support nested creation plus add/update/delete routes under `/api/products/{product_id}/attributes`; variant prices are returned as `extra_price`. Product tax rules use `GET/PUT /api/products/{product_id}/taxes`.
- Plans: `GET/POST /api/plans`, `GET/PATCH/DELETE /api/plans/{plan_id}`. Filters include `q`, `status`, `product_id`, `page`, and `page_size`. Periods are daily, weekly, monthly, yearly. Plan fields include minimum quantity, trial days, pausing, renewal, early closure, auto-close, and availability dates.
- Customers: `GET/POST /api/customers`, `GET/PATCH/DELETE /api/customers/{customer_id}`. Staff/admin only. Customer details include subscriptions, invoices, payments, and linked activity. `POST /api/customers/{customer_id}/invite` requires SMTP delivery.
- Quotation templates: `GET/POST /api/quotation-templates`, `GET/PUT/DELETE /api/quotation-templates/{template_id}`. Templates contain validated product/plan lines, payment terms, and validity days.
- Taxes: `GET/POST /api/taxes`, `PATCH/DELETE /api/taxes/{tax_id}`. Types are percentage and fixed; a partial unique index allows one default tax.
- Discounts: `GET/POST /api/discounts`, `PATCH/DELETE /api/discounts/{discount_id}`, `POST /api/discounts/validate`. Supports unique code, percentage/fixed value, minimum quantity/purchase, dates, limit, and applicable products.

## Subscriptions and billing

- Subscriptions: `GET/POST /api/subscriptions`, `POST /api/subscriptions/preview`, `GET/PATCH /api/subscriptions/{subscription_id}`, and `POST /api/subscriptions/{subscription_id}/{action}`. Actions are `confirm`, `activate`, `pause`, `resume`, `renew`, and `close`. Creation can use saved quotation templates with `POST /api/subscriptions/from-template`.
- Transitions are validated and written to subscription history. Price preview and creation resolve product, plan, variant, tax, and discount data on the server.
- Invoices: `GET /api/invoices`, `GET /api/invoices/{invoice_id}`, `POST /api/invoices/{invoice_id}/confirm`, `/send`, `/cancel`, `GET /api/invoices/due-preview`, `POST /api/invoices/generate-due`. Sending emails the customer and updates status only after successful SMTP delivery.
- Due preview is read-only. Generation locks subscriptions and relies on the existing unique subscription/date invoice index; it returns `{created, skipped}`. A new migration adds other fields/tables and must be applied before using those schema features.
- Payments: `GET/POST /api/payments`, `GET /api/payments/{payment_id}`. Methods: cash, bank transfer, UPI, card, cheque. Invoice and payment balances update in one transaction; overpayments are rejected.

## Analytics, reports, AI, portal, administration

- Analytics: `GET /api/analytics/summary`, `/revenue-over-time`, `/revenue-by-plan`, `/expiring-subscriptions`, `/recent-activity`.
- Reports: `GET /api/reports/subscriptions`, `/payments`, `/revenue`, `/overdue-invoices`. `export=true` returns CSV where supported. Filters include date range, customer, plan, product, and subscription status where applicable.
- AI: `POST /api/ai/chat`, `GET /api/ai/conversations/{conversation_id}`, `POST /api/ai/approve`. Tools are allowlisted and operate through fixed ORM queries/services. Reminder delivery requests are queued for admin approval; approved delivery uses the SMTP reminder service and deduplication log. Without a configured provider key, chat responds with an availability message and other APIs continue working.
- Portal: `GET /api/portal/summary`, `/subscriptions`, `/subscriptions/{subscription_id}`, `/invoices`, `/invoices/{invoice_id}`, `/payments`, `/profile`; `PATCH /api/portal/profile`; subscription self-service uses `POST /api/portal/subscriptions/{subscription_id}/{action}`.
- Users: `GET/POST /api/users`, `PATCH /api/users/{user_id}`. Admin only; the last active administrator cannot be removed.
- Settings: `GET/PATCH /api/settings` (admin/staff read, admin write), `GET/PATCH /api/settings/profile`.

## Environment variables

Required existing names: `DATABASE_URL`, `SECRET_KEY`. Optional: `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `FRONTEND_URL`, `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_STARTTLS`, `ENABLE_AUTOMATION`, `AUTO_GENERATE_DUE_INVOICES`, `AUTO_CLOSE_EXPIRED_SUBSCRIPTIONS`.

The Alembic feature revision is `c91a4b7d2e10`; apply with `alembic upgrade head` after confirming the configured database is the intended environment.
