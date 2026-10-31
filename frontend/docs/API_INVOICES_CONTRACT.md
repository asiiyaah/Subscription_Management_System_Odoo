# Invoices & payments API contract (frontend expectations)

Used by the Invoices pages when `VITE_USE_MOCKS=false`. Types live in `frontend/src/types/invoice.ts`.
All money values are numbers in rupees (e.g. `1179.82`), all dates are `YYYY-MM-DD`, errors use `{ "detail": "message" }`.
**The backend calculates every amount** (line amounts, discounts, taxes, totals, balance) — the frontend only displays them.

## GET `/api/invoices`

Query params: `page`, `page_size`, `search` (number / customer / subscription), `sort_by`, `sort_dir` (`asc|desc`),
`status` (`draft|confirmed|paid|cancelled`), `overdue=true`, `customer_id`, `subscription_id`.

```json
{
  "items": [{
    "id": 12, "number": "INV-2026-0012", "status": "confirmed", "is_overdue": true,
    "customer_id": 3, "customer_name": "Pixel Studio",
    "subscription_id": 7, "subscription_number": "SUB-0007",
    "invoice_date": "2026-09-14", "due_date": "2026-09-29",
    "total": 2357.64, "amount_paid": 0, "balance": 2357.64
  }],
  "total": 43, "page": 1, "page_size": 10
}
```

- `is_overdue` = `status == "confirmed"` and `balance > 0` and `due_date < today` (computed by backend).
- "Partially paid" is not a status: it's `confirmed` with `amount_paid > 0` and `balance > 0`.

## GET `/api/invoices/summary`

```json
{
  "counts": { "all": 43, "draft": 4, "confirmed": 12, "paid": 26, "cancelled": 1, "overdue": 6 },
  "total_invoiced": 98234.5, "total_paid": 71200.0, "outstanding": 27034.5, "overdue_amount": 14120.0
}
```
Totals exclude draft and cancelled invoices.

## GET `/api/invoices/{id}`

List row fields plus:

```json
{
  "customer_email": "hello@pixelstudio.in", "customer_address": "22 Linking Road, Mumbai",
  "plan_name": "Pro Monthly", "period_start": "2026-09-14", "period_end": "2026-10-13", "payment_terms": "Net 15",
  "lines": [{ "id": 1, "product_name": "Project Management Suite", "description": "Pro Monthly · 3 seat(s)",
              "quantity": 3, "unit_price": 999, "tax_label": "GST 18%", "tax_amount": 485.51, "amount": 2997 }],
  "untaxed_amount": 2997,
  "discount": { "code": "SEATS10", "label": "10% off for 5+ seats", "amount": 299.7 },
  "taxes": [{ "label": "CGST 9%", "amount": 242.76 }, { "label": "SGST 9%", "amount": 242.75 }],
  "tax_total": 485.51,
  "payments": [{ "id": 3, "payment_date": "2026-09-20", "method": "upi", "amount": 1000, "note": "UTR 4100037" }],
  "sent_at": "2026-09-15T10:12:00Z"
}
```
`discount` is omitted when none applies. **404** if not found.

## Actions — each returns the updated invoice (send returns `{ message }`)

| Endpoint | Allowed when | Errors |
|---|---|---|
| `POST /api/invoices/{id}/confirm` | status = draft | 409 otherwise |
| `POST /api/invoices/{id}/cancel` | draft or confirmed, **no payments** | 409 otherwise |
| `POST /api/invoices/{id}/send` | confirmed or paid — emails the invoice | 409 for draft/cancelled |

## Billing run (no double billing — R26)

`GET /api/invoices/due-preview` — one row per active subscription whose current period has started:

```json
[{ "subscription_id": 1, "subscription_number": "SUB-0001", "customer_name": "Acme Retail", "plan_name": "Basic Monthly",
   "period_start": "2026-10-01", "period_end": "2026-10-31", "estimated_total": 588.82,
   "status": "ready" },
 { "...": "...", "status": "skipped", "skip_reason": "Already invoiced for this period" }]
```

`POST /api/invoices/generate-due` → `{ "created": 4, "skipped": 8, "invoice_ids": [44, 45, 46, 47] }`
Creates **draft** invoices for `ready` rows. Must be idempotent: running it twice creates nothing the second time
(unique constraint on `subscription_id + period_start`).

## POST `/api/payments`

```json
{ "invoice_id": 12, "amount": 1000, "payment_date": "2026-10-31", "method": "upi", "note": "UTR 4100037" }
```

- `method`: `upi | bank_transfer | card | cash | cheque`
- Returns the **updated invoice**; when `balance` reaches 0 the backend sets `status = "paid"`.
- **409** if the invoice isn't confirmed · **422** if `amount <= 0` or `amount > balance`.
