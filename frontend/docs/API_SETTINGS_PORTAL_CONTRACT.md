# Settings, account & customer portal — API contract (frontend expectations)

Used by `/settings` and `/portal/*` when `VITE_USE_MOCKS=false`. Types: `frontend/src/types/settings.ts`, `frontend/src/types/portal.ts`.
Errors use `{ "detail": "message" }`.

## Your own account (any signed-in role)

| Method & path | Body / response |
|---|---|
| `GET /api/auth/me` | `{ "id": 3, "name": "Acme Retail", "email": "customer@acmeretail.in", "phone": "+91…", "company": "Acme Retail", "billing_address": "12 MG Road, Bengaluru" }` — `company` / `billing_address` only for customers |
| `PUT /api/auth/me` | `{ "name", "phone", "company", "billing_address" }` → updated profile. Email can't be changed here (it's the login). **422** empty name. |
| `POST /api/auth/change-password` | `{ "current_password", "new_password" }` → `{ "message" }`. **400** wrong current password · **422** new password breaks R3 or equals the current one. |

## Business settings

`GET /api/settings/business` — **any signed-in user** (invoices and the portal print the seller details).
`PUT /api/settings/business` — **admin only** (403 otherwise).

```json
{
  "company_name": "SubscriptIQ Technologies Pvt. Ltd.",
  "address": "91 Residency Road, Bengaluru, Karnataka 560025",
  "email": "billing@subscriptiq.com", "phone": "+91 80 4000 1234",
  "gstin": "29AAKCS1234F1Z5", "currency": "INR",
  "invoice_prefix": "INV-", "subscription_prefix": "SUB-",
  "payment_terms_days": 15,
  "bank": { "name": "HDFC Bank, Residency Road", "account": "50200012345678", "ifsc": "HDFC0001234", "upi": "subscriptiq@hdfcbank" }
}
```
- **422**: GSTIN not 15 chars in the GST format; IFSC not `AAAA0XXXXXX`; prefixes not 1–8 of `A–Z 0–9 -`; payment terms not 0–120.
- New invoices use the prefix and `due_date = invoice_date + payment_terms_days`. Existing invoices don't change.

## Automation settings (admin only)

`GET` / `PUT /api/settings/automation` — read by the backend's scheduler (APScheduler).

```json
{ "auto_generate_invoices": true, "invoice_run_time": "06:00",
  "renewal_reminder_days": 7, "overdue_reminder_days": 3, "auto_close_expired": true }
```
- `invoice_run_time`: `HH:MM` 24-hour, server time zone. The daily run must reuse the normal billing run (no double billing).
- `renewal_reminder_days` ∈ {0, 3, 7, 14, 30}, `overdue_reminder_days` ∈ {0, 1, 3, 7, 14}; **0 = off**.
- `auto_close_expired` only closes subscriptions whose **plan** is set to close on its own.

## Customer portal (customer role only — R6)

Every portal endpoint takes the customer **from the token**, never from a parameter, and returns only that customer's data.
Staff/admin calling them → **403**.

### GET `/api/portal/summary`

```json
{
  "customer_name": "Acme Retail",
  "active_subscriptions": 2,
  "outstanding": 1765.64, "overdue_amount": 1179.82,
  "next_due": { "invoice_id": 12, "number": "INV-2026-0012", "due_date": "2026-09-29", "balance": 1179.82, "is_overdue": true },
  "subscriptions": [ { "id": 1, "number": "SUB-0001", "plan_name": "Basic Monthly", "status": "active",
                       "next_invoice_date": "2026-11-01", "monthly_amount": 499 } ],
  "recent_invoices": [ /* up to 5 invoice list rows, newest first, no drafts */ ]
}
```
`next_due` is the unpaid invoice with the earliest due date, or `null`.

### GET `/api/portal/invoices`
Same params and row shape as `GET /api/invoices` (see API_INVOICES_CONTRACT.md) plus `unpaid=true` (= confirmed with balance > 0).
**Never returns drafts.**

### GET `/api/portal/invoices/{id}`
Same shape as `GET /api/invoices/{id}`. **404** (not 403) if it belongs to another customer or is a draft — don't reveal it exists.

### GET `/api/portal/subscriptions`, `/api/portal/subscriptions/{id}`
Owned by Frontend Member 1 (My Subscriptions pages); same scoping rules.
