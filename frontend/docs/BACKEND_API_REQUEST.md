# Backend API request — what the frontend still needs

> Copy everything below the line into your AI assistant (or read it as a task list).
> It's written against the current code in `backend/app/` (routers, models, services).

---

You are working on the **SubscriptIQ** backend: Python **FastAPI + SQLAlchemy + PostgreSQL + Alembic**, code in
`backend/app/`. The React frontend is already built against agreed JSON contracts and runs on mock data for the
modules below. Your job is to **extend the existing API so these frontend modules can switch to it** with no UI changes:
**Invoices, Payments, Customer portal, Reports, AI assistant**, plus small additions to **Settings** and **Users**.

## Ground rules

1. **Additive only.** Don't remove or rename existing fields, routes or query params — other screens use them.
   Add new fields next to the old ones.
2. Follow the existing style in `app/routers/*.py`: dict serializers, `str(uuid)` ids, money as **decimal strings**
   (`"1179.82"`), dates as `YYYY-MM-DD`, datetimes ISO 8601, errors as `HTTPException(status, "Readable message")`
   (the UI shows `detail` to the user as-is, so write it for end users).
3. Paginated lists keep the shape `{ "items": [...], "total": n, "page": n, "page_size": n }`.
4. Auth: keep `get_current_user` / `require_roles(...)`. Customers are always scoped by `user.customer_id` from the
   token, never from a parameter. Another customer's record → **404**, not 403.
5. Sums, counts and groupings are done **in SQL** (`func.sum`, `GROUP BY`) — the brief requires every page under 2 s
   with thousands of subscriptions. No loading all rows into Python to aggregate.
6. New columns → an **Alembic migration** in `backend/alembic/versions/`.
7. Avoid N+1 queries: use `joinedload` / `selectinload` for customer, subscription and lines.

Full field-by-field contracts are in the repo: `frontend/docs/API_INVOICES_CONTRACT.md`,
`API_REPORTS_CONTRACT.md`, `API_SETTINGS_PORTAL_CONTRACT.md`, `API_AI_CONTRACT.md`, `API_USERS_CONTRACT.md`.
The TypeScript types the UI expects are in `frontend/src/types/*.ts`.

---

## P1 — Invoices (`app/routers/invoices.py`)

### 1.1 Extend `_invoice_dict` (used by list and detail)
Add (keep all existing keys):
```json
"number": "INV-2026-0012",            // same value as invoice_number
"customer_name": "Pixel Studio",       // invoice.customer.name
"customer_email": "hello@pixelstudio.in",
"customer_address": "22 Linking Road, Mumbai 400050",   // join address, city, state, postal_code; null if empty
"subscription_number": "SUB-0007",     // invoice.subscription.subscription_number or null
"plan_name": "Pro Monthly",            // from the subscription's first line plan; null if none
"base_status": "open",                 // the REAL stored status (today "status" is replaced by "overdue")
"is_overdue": true,                    // same as the existing "overdue"
"period_start": "2026-09-14",          // = invoice_date unless you store it
"period_end": "2026-10-13",            // invoice_date + subscription billing period − 1 day
"payment_terms": "Net 15",             // "Net {(due_date − invoice_date).days}", "Due immediately" for 0
"balance": "2357.64",                  // same as balance_due
"untaxed_amount": "2997.00",           // = subtotal
"taxes": [{ "label": "GST 18%", "amount": "485.51" }],   // sum of line taxes grouped by tax_name_snapshot
"discount": { "code": "SEATS10", "label": "10% off for 5+ seats", "amount": "299.70" },  // null if no discount
"sent_at": null                         // from ActivityLog "invoice_sent" if available, else null
```
Lines: add `"product_name"` (line.product.name) and `"tax_label"` (first tax name, e.g. "GST 18%").

**Detail only** (`GET /api/invoices/{id}`): add
`"payments": [{ "id", "number": payment_reference or short id, "payment_date", "method": payment_method, "amount", "note" }]`.

### 1.2 Status mapping
The UI uses **draft → confirmed → paid (+ cancelled)**. Keep your stored statuses, but:
- Add `"ui_status"`: `draft` → `draft`; `open | sent | partial` → `confirmed`; `paid` → `paid`; `cancelled` → `cancelled`.
- In `GET /api/invoices`, accept `status=confirmed` meaning `status IN ('open','sent','partial')`.

### 1.3 List params for `GET /api/invoices`
Add: `q` (ILIKE on invoice_number or customer name), `subscription_id`, `sort_by` ∈
`{invoice_number, invoice_date, due_date, total, balance_due, customer_name}`, `sort_dir` ∈ `{asc, desc}`
(default `invoice_date desc`). Allow the frontend's sort keys `number → invoice_number`, `balance → balance_due`.

### 1.4 New `GET /api/invoices/summary` (admin, staff)
```json
{ "counts": { "all": 43, "draft": 4, "confirmed": 12, "paid": 26, "cancelled": 1, "overdue": 6 },
  "total_invoiced": "98234.50", "total_paid": "71200.00", "outstanding": "27034.50", "overdue_amount": "14120.00" }
```
Totals exclude draft and cancelled. One or two grouped SQL queries.

### 1.5 `GET /api/invoices/due-preview` rows
Add `customer_name`, `plan_name`, `period_start` (= invoice_date), `period_end`, and
`"status": "skipped" | "ready"` (from `already_invoiced`), `"skip_reason": "Already invoiced for this period"`.

### 1.6 `POST /api/invoices/generate-due`
Also return `"invoice_ids": [...]` of the created drafts. It must stay idempotent (running twice creates nothing).

**Acceptance:** list shows names not UUIDs; `status=confirmed` and `overdue=true` filter correctly; detail has
payments and tax breakdown; generate-due twice → second call `created: 0`.

---

## P1 — Payments (`app/routers/payments.py`)

1. `_payment_dict`: add `"number"` (payment_reference or `PAY-` + short id), `"invoice_number"`, `"customer_name"`,
   `"method"` (= payment_method with spaces → underscores, e.g. `bank_transfer`).
2. `GET /api/payments` params: `q` (number / customer / invoice number / note), `method`, `date_from`, `date_to`
   (inclusive dates), `sort_by` ∈ `{payment_date, amount, customer_name}`, `sort_dir`.
3. `POST /api/payments`: also accept `"method"` with `bank_transfer` (map to `"bank transfer"`), and the UI sends
   `"payment_date": "YYYY-MM-DD"` (date only). **Return the updated invoice** (`_invoice_dict` + payments) instead of
   the payment — the UI refreshes the invoice from it. Keep 422 for amount > balance and 409 for draft/cancelled.
4. New `GET /api/payments/summary` (admin, staff):
   ```json
   { "collected_this_month": "18450.50", "payments_this_month": 9, "top_method": "upi", "outstanding": "27034.50",
     "by_method": [{ "method": "upi", "amount": "9200.00", "count": 4 }] }
   ```

---

## P2 — Customer portal (`app/routers/portal.py`)

1. `GET /api/portal/summary` — add (keep existing keys):
   ```json
   "customer_name": "Acme Retail",
   "outstanding": "1765.64", "overdue_amount": "1179.82",
   "next_due": { "invoice_id", "number", "due_date", "balance", "is_overdue" },      // earliest-due unpaid, or null
   "subscriptions": [{ "id", "number", "plan_name", "status", "next_invoice_date", "monthly_amount" }],
   "recent_invoices": [ /* 5 newest invoice rows in the 1.1 shape, no drafts */ ]
   ```
2. `GET /api/portal/invoices` — paginated shape, params `page`, `page_size`, `q`, `status`, `unpaid=true`
   (= confirmed with balance > 0), sort like invoices; rows in the 1.1 shape; **exclude drafts**.
3. `GET /api/portal/invoices/{id}` — return the full admin detail shape (1.1 + payments); **404 for drafts**.
4. Make business details readable by customers: either allow `customer` on `GET /api/settings`, or add
   `GET /api/settings/business` (any signed-in user) returning name, address, email, phone, gstin and bank details.
5. `GET /api/portal/profile` / `PATCH`: add `billing_address` (map to customer address fields).

---

## P3 — Reports (`app/routers/reports.py`)

Keep the existing raw endpoints (used for CSV). Add **one** aggregate endpoint:

`GET /api/reports?date_from&date_to&plan_id&customer_id` (admin, staff) returning exactly the shape in
`frontend/docs/API_REPORTS_CONTRACT.md`:
`summary`, `revenue_by_month`, `revenue_by_plan`, `subscriptions_by_status`, `subscriptions_by_plan`,
`subscriptions` (≤100), `payments_by_month`, `payments_by_method`, `payments` (≤100) + `payments_total`,
`payment_timing` + `avg_days_to_pay`, `outstanding_by_month`, `overdue_aging`, `overdue`.

Rules: months in range with zeros included, oldest first; `subscriptions_by_status` always all six statuses in order;
aging buckets fixed (1–30, 31–60, 61–90, 90+); invoiced/revenue exclude draft and cancelled; MRR = active
subscriptions' monthly value after discount, before tax (reuse `_monthly_amount` from `analytics.py`).
`GET /api/reports/options` → `{ "plans": [{ "id", "name" }], "customers": [{ "id", "name" }] }`.

---

## P4 — AI assistant (`app/routers/ai.py`)

Keep the current fields, and **add** a `reply` object so the UI can render it:
```json
{
  "conversation_id": "…",
  "response": "…", "tool_result": {…}, "structured_result": {…},   // existing, keep
  "reply": {
    "id": "<assistant message id>",
    "content": "**4 subscriptions** expire in the next 7 days…",     // markdown-lite: **bold**, line breaks, "- " bullets
    "tool_calls": [{ "id", "name": "get_expiring_subscriptions", "args": { "days": 7 }, "status": "success", "summary": "4 found" }],
    "data": { "kind": "table" | "metrics" | "bar_chart", … },        // optional, see API_AI_CONTRACT.md
    "pending_action": { "id": "<approval id>", "type": "send_renewal_reminders" | "generate_invoices",
                        "title", "description", "preview": [{ "label", "detail" }], "confirm_label" },   // optional
    "suggestions": ["Prepare renewal reminders for them"]                                              // optional
  }
}
```
- `content` must be a human sentence built from the tool result (e.g. "4 subscriptions expire…"), not
  "Tool X completed." — have the model summarise the tool result, or template it per tool.
- Map each tool result to `data`: lists → `table` (with `columns[{key,label,format}]`, `rows`, and
  `link: {base: "/invoices/", key: "id"}` for invoices); MRR / revenue → `metrics`; revenue by plan → `bar_chart`.
- Add an approvable **`generate_invoices`** action (preview = `preview_due_invoices` rows not yet invoiced; on
  approve call `generate_due_invoices`).
- Add `POST /api/ai/actions/{id}/approve` and `/reject` (admin) returning
  `{ "status": "completed" | "rejected", "message": "4 renewal reminders sent" }` (can wrap the existing `/approve`).
- Without an API key, return a `reply` with `content` explaining that, instead of failing.

---

## P5 — Settings & Users (small)

**Settings** (`app/models/settings.py` + `routers/settings.py`, migration needed): add columns and fields
`gstin`, `bank_name`, `bank_account`, `bank_ifsc`, `upi_id`, `invoice_run_time` (`"HH:MM"`),
`renewal_reminder_days` (0 = off, replaces/extends `send_renewal_reminders`), `overdue_reminder_days` (0 = off).
Validate GSTIN (`^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`) and IFSC (`^[A-Z]{4}0[A-Z0-9]{6}$`) → 422.
Make the scheduler (`app/automation/jobs.py`) read `invoice_run_time` and the reminder days.

**Users** (`routers/users.py`):
1. Return `created_at` (already on the model) and `last_login` (new column, set in `/api/auth/login`).
2. `GET /api/users`: add `active=true|false` filter, exclude customers by default (`role IN ('admin','staff')`),
   and `GET /api/users/counts` → `{ "all", "admin", "staff", "disabled" }`.
3. `POST /api/users`: optional `"send_invite": true` (no password) → create the user with an unusable password and
   email a set-password link using the existing password-reset token flow.
4. `POST /api/users/{id}/password-reset` (admin) → sends the reset email for that user.
5. Error codes: the UI already handles your 409s for "can't remove your own admin access" and "last active
   administrator" — keep them.
6. `/api/auth/login` for a disabled account currently returns 401 "Incorrect email or password." — return
   **403 "This account has been disabled. Contact your admin."** so the user knows why.

**Taxes / discounts (nice to have):** on `DELETE` of a never-used discount, really delete it (409 if used);
on taxes, block deactivating or deleting the default tax (422 "Make another tax the default first").

---

## Deliverables

- [ ] P1 Invoices + Payments (highest priority — core demo flow)
- [ ] P2 Customer portal
- [ ] P3 Reports aggregate endpoint
- [ ] P4 AI `reply` object + `generate_invoices` approval
- [ ] P5 Settings & Users additions + migration
- [ ] `/docs` (Swagger) shows every new endpoint with example responses
- [ ] Tell the frontend which items are done; it switches them on with `VITE_LIVE_APIS` in `frontend/.env`
      (see `frontend/docs/BACKEND_INTEGRATION.md`).
