# Backend integration — Member 2 modules

How Member 2's pages connect to the FastAPI backend, what is live, and what the backend still needs.
Member 1's pages are **not** affected: they keep following `VITE_USE_MOCKS`.

## 1. Switching modules to the real API

In `frontend/.env`:

```bash
VITE_API_URL=http://localhost:8000
VITE_USE_MOCKS=true      # Member 1 keeps her mocks
VITE_LIVE_APIS=taxes,discounts,users,settings,lookups,invoices,payments,reports,portal,ai
```

- Restart `npm run dev` after changing `.env`.
- Listing **any** module also switches **auth** and **account** to the backend (real APIs need real login tokens).
- Remove a name to put just that module back on mocks; leave the line empty for full mock mode.
- The backend must allow the frontend origin: `FRONTEND_URL=http://localhost:5173` (CORS).
- Log in with a **database** account. Demo data: `python -m scripts.seed_demo` (see `backend/scripts/seed_demo.py`).

## 2. Status per module

Every Member 2 module now runs on the real backend. The backend follows the contracts in this folder, so the
adapters in `src/services/*Service.ts` only convert ids (UUID strings), decimal strings and `null`s.

| Module | Live | Backend | Remaining limitations |
|---|---|---|---|
| Auth, account | ✅ | `/api/auth/*`, `/api/settings/profile`, `/api/portal/profile` | Staff have no phone field. **Changing your password signs you out** (old tokens are invalidated). |
| Invoices + billing run | ✅ | `/api/invoices`, `/summary`, `/due-preview`, `/generate-due`, actions | Sorting by customer name falls back to invoice date. "Send" needs SMTP on the server (otherwise 503 with a clear message). |
| Payments | ✅ | `/api/payments`, `/summary` | — |
| Discounts | ✅ | `/api/discounts`, `/counts`, `/validate` | — |
| Taxes | ✅ | `/api/taxes`, `/{id}/default` | `DELETE` deactivates (so "Delete" stays hidden). |
| Users & staff | ✅ | `/api/users`, `/counts`, `/{id}/password-reset` | Invite / reset emails need SMTP; without it the user is still created and the message says so. List is newest first (no sort). |
| Settings | ✅ | `/api/settings`, `/api/settings/business` | — |
| Reports | ✅ | `/api/reports`, `/options` | "Time to pay" shows the average only (no day buckets yet). Burn-down groups unpaid balance by due month. |
| Customer portal | ✅ | `/api/portal/*` | Subscriptions on Portal Home show the number instead of the plan name (not sent by `/portal/subscriptions`). |
| AI assistant | ✅ | `/api/ai/chat`, `/api/ai/actions/{id}/approve\|reject` | Needs `GEMINI_API_KEY` (or OpenAI) on the server; without it the assistant replies that it's unavailable. |

## 3. Original backend change request (now implemented)

Kept for reference — the backend commit `bb2aba5` implemented these. Small follow-ups still open: plan name in `/api/portal/subscriptions`, day buckets for `payment_timing`, sort by customer name for invoices.

### Invoices (`backend/app/routers/invoices.py`)
1. **List + detail rows:** add `customer_name`, `subscription_number`, `plan_name`. Without them the list can only show UUIDs.
2. **Statuses:** the UI uses Draft → Confirmed → Paid (+ Cancelled). The backend has `open / sent / partial` — either
   accept `status=confirmed` as "open, sent or partial", or add a `status_in=open,sent,partial` filter.
   Keep overdue as a separate boolean (`overdue`), not as the `status` value.
3. **List params:** `q` (number / customer name), `sort_by` + `sort_dir`, `subscription_id`.
4. **Detail:** add `payments: [{ id, payment_reference, payment_date, payment_method, amount, note }]`,
   `period_start`, `period_end`, `payment_terms`, and a tax breakdown `taxes: [{ name, amount }]` (sum of line taxes).
5. **`GET /api/invoices/summary`:** counts per status + `total_invoiced`, `total_paid`, `outstanding`, `overdue_amount`
   (see `API_INVOICES_CONTRACT.md`).
6. **`/due-preview` rows:** add `customer_name`, `plan_name`, `period_end`.
7. **`/send`:** today returns 503 when SMTP isn't configured — fine, the UI shows the message.

### Payments (`backend/app/routers/payments.py`)
1. Rows: add `invoice_number`, `customer_name`.
2. List params: `q`, `payment_method`, `date_from`, `date_to`, `sort_by`, `sort_dir`.
3. `GET /api/payments/summary`: `collected_this_month`, `payments_this_month`, `top_method`, `outstanding`, `by_method[]`.
4. `POST` response: the UI expects the **updated invoice** back (or it refetches — either works; tell us which).
5. Method values: UI sends `bank_transfer`; backend expects `"bank transfer"`. Accept both or we map it.

### Reports (`backend/app/routers/reports.py`)
The page needs **aggregates**, not raw rows. One `GET /api/reports?date_from&date_to&plan_id&customer_id` returning the
shape in `API_REPORTS_CONTRACT.md` (monthly sums, by plan, by method, status counts, aging, payment timing, month-end
outstanding) keeps it fast with thousands of rows. The existing raw endpoints can stay for CSV export.

### Customer portal (`backend/app/routers/portal.py`)
1. `/summary`: add `customer_name`, `outstanding`, `overdue_amount`, `next_due`, `subscriptions[]` (with `plan_name`,
   `monthly_amount`), `recent_invoices[]` — see `API_SETTINGS_PORTAL_CONTRACT.md`.
2. `/invoices`: paginated (`items/total/page/page_size`), filters `unpaid=true`, `status`, `q`; **exclude drafts**.
3. `/invoices/{id}`: same full shape as the admin invoice detail (lines with tax, payments); 404 for drafts.
4. `GET /api/settings` readable by customers (or a public `/api/settings/business`) so "How to pay" shows real details.

### AI (`backend/app/routers/ai.py`)
The UI renders `reply.content`, `tool_calls[]`, `data` (table / metrics / bar_chart) and `pending_action` — see
`API_AI_CONTRACT.md`. Today the endpoint returns `response` text + raw `tool_result`. Needed:
1. Return `{ conversation_id, reply: { id, content, tool_calls, data?, pending_action?, suggestions? } }`.
2. `pending_action` for reminders/invoice generation with a `preview[]` list; approve via
   `POST /api/ai/actions/{id}/approve|reject` (or keep `/api/ai/approve` with `{approval_id, approve}` — we'll map it).
3. Add `generate_invoices` as an approvable action that reuses `generate_due_invoices`.

### Settings (nice to have)
Store `gstin`, bank details (`bank_name`, `account`, `ifsc`, `upi`), `invoice_run_time`, `renewal_reminder_days`,
`overdue_reminder_days`. Users: return `last_login`, `created_at`; optional invite flow (`send_invite: true`).
