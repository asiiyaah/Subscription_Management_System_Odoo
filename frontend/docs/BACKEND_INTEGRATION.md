# Backend integration — Member 2 modules

How Member 2's pages connect to the FastAPI backend, what is live, and what the backend still needs.
Member 1's pages are **not** affected: they keep following `VITE_USE_MOCKS`.

## 1. Switching modules to the real API

In `frontend/.env`:

```bash
VITE_API_URL=http://localhost:8000
VITE_USE_MOCKS=true                                   # Member 1 keeps her mocks
VITE_LIVE_APIS=taxes,discounts,users,settings,lookups # Member 2 modules on the real backend
```

- Restart `npm run dev` after changing `.env`.
- Listing **any** module also switches **auth** (login, sign-up, forgot/reset password) and **account**
  (profile, change password) to the backend — real APIs only accept real login tokens.
- Leave `VITE_LIVE_APIS` empty to go back to full mock mode.
- The backend must allow the frontend origin: `FRONTEND_URL=http://localhost:5173` in the backend settings (CORS).
- Log in with an account that exists in the **database** (mock demo accounts don't exist there).

## 2. Status per module

| Module | Live? | Backend endpoints | Notes / limitations in live mode |
|---|---|---|---|
| Auth (login, sign-up, forgot, reset) | ✅ | `/api/auth/*` | Matches the contract exactly. |
| Account (profile, password) | ✅ | `/api/settings/profile`, `/api/portal/profile`, `/api/auth/change-password` | Staff have no phone field; customer billing address isn't stored. **Changing your password signs you out** (the backend invalidates old tokens) — the UI says so and returns to login. |
| Taxes | ✅ | `/api/taxes` | No per-rule product targeting (taxes are attached per product). `DELETE` deactivates, so "Delete" is hidden. No "can't deactivate the default" guard on the server — the UI enforces it. |
| Discounts | ✅ | `/api/discounts`, `/api/discounts/validate` | Status, counts, code search and sorting are worked out in the browser over all discounts (max 100). `DELETE` deactivates, so "Delete" is hidden. `validate` returns the discount amount; product targeting isn't checked there. |
| Product pickers | ✅ | `/api/products?status=active` | Used by discount product targeting. |
| Users & staff | ✅ | `/api/users`, `/api/auth/forgot-password` | No invite link (temporary password only); no last-login / created dates (columns hidden); disabled filter and counts computed in the browser (max 100 accounts). Password reset uses the normal forgot-password email. |
| Settings — Business / Automation | ✅ | `/api/settings` | GSTIN and bank/UPI aren't stored (fields disabled, invoices use defaults). Reminders are on/off only; no run time or overdue reminders. Customers can't read business settings, so the portal uses defaults. |
| Invoices, billing run | ⏳ mock | `/api/invoices/*` | Needs the backend changes in §3. |
| Payments | ⏳ mock | `/api/payments` | Needs §3. |
| Reports | ⏳ mock | `/api/reports/*`, `/api/analytics/*` | Needs §3. |
| Customer portal (home, invoices) | ⏳ mock | `/api/portal/*` | Needs §3. |
| AI assistant | ⏳ mock | `/api/ai/chat`, `/api/ai/approve` | Needs §3. |

All adapters live in the service files (`src/services/*Service.ts`): each maps backend fields (snake_case names,
UUID ids, money as decimal strings) to the UI's types, so pages didn't change.

## 3. Backend changes needed for the remaining modules

These are small serializer/query additions — no new tables. With them, each module switches live without UI changes.

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
