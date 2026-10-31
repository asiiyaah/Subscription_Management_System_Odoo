# Reports API contract (frontend expectations)

Used by the Reports page (`/reports`) when `VITE_USE_MOCKS=false`. Type: `frontend/src/types/report.ts`.
One call returns everything the page shows for the chosen filters — **all sums are done in the database** (GROUP BY),
so the page stays under 2 s with thousands of subscriptions (R39). Money in rupees, dates `YYYY-MM-DD`.

## GET `/api/reports`

| Param | Meaning |
|---|---|
| `date_from`, `date_to` | Inclusive range. Applies to invoices (`invoice_date`) and payments (`payment_date`). |
| `plan` | Optional plan **name** (e.g. `Pro Monthly`). Filters subscriptions, invoices and payments. |
| `customer_id` | Optional. Same scope as `plan`. |

Response (shortened):

```json
{
  "summary": {
    "active_subscriptions": 12, "mrr": 48210.5,
    "invoiced": 98234.5, "collected": 71200.0,
    "outstanding": 27034.5, "overdue_amount": 14120.0, "overdue_count": 6
  },
  "revenue_by_month": [ { "month": "2026-08", "invoiced": 30120.4, "collected": 28870.0 } ],
  "revenue_by_plan":  [ { "plan": "Business Monthly", "invoiced": 52000, "collected": 41000 } ],
  "subscriptions_by_status": [ { "status": "draft", "count": 1 }, { "status": "active", "count": 12 } ],
  "subscriptions_by_plan":   [ { "plan": "Business Monthly", "count": 4, "mrr": 23988 } ],
  "subscriptions": [ { "id": 7, "number": "SUB-0007", "customer_name": "Acme Retail", "plan_name": "Pro Monthly",
                       "status": "active", "start_date": "2026-04-12", "mrr": 2997 } ],
  "payments_by_month":  [ { "month": "2026-08", "amount": 28870.0, "count": 11 } ],
  "payments_by_method": [ { "method": "upi", "amount": 31000, "count": 12 } ],
  "payments": [ { "id": 42, "number": "PAY-0042", "payment_date": "2026-10-20", "customer_name": "Pixel Studio",
                  "invoice_id": 12, "invoice_number": "INV-2026-0012", "method": "upi", "amount": 1000 } ],
  "payments_total": 31,
  "overdue_aging": [ { "bucket": "1–30 days", "amount": 9020, "count": 4 }, { "bucket": "31–60 days", "amount": 5100, "count": 2 },
                     { "bucket": "61–90 days", "amount": 0, "count": 0 }, { "bucket": "90+ days", "amount": 0, "count": 0 } ],
  "overdue": [ { "id": 12, "number": "INV-2026-0012", "customer_name": "Pixel Studio", "plan_name": "Pro Monthly",
                 "due_date": "2026-09-29", "days_overdue": 32, "balance": 2357.64 } ]
}
```

### Rules

- **Point-in-time (today), not limited by dates:** `active_subscriptions`, `mrr`, `outstanding`, `overdue_*`,
  `subscriptions*`, `overdue*`. They still respect `plan` / `customer_id`.
- **Within the date range:** `invoiced`, `collected`, `revenue_by_*`, `payments*`.
- `invoiced` and revenue exclude **draft** and **cancelled** invoices; amounts include tax.
- `mrr` = monthly value of **active** subscriptions after discounts, before tax (yearly plans ÷ 12).
- `revenue_by_month` / `payments_by_month`: **one entry per month in the range**, zeros included, oldest first.
- `subscriptions_by_status`: all six statuses in order draft, quotation, confirmed, active, paused, closed (zeros included).
- `overdue_aging`: always the four buckets in that order.
- `payments`: newest first, max 100; `payments_total` is the full count.

## GET `/api/reports/options`

`{ "plans": ["Basic Monthly", "Pro Monthly", "Business Monthly"], "customers": [{ "id": 1, "name": "Acme Retail" }] }`
— values for the Plan and Customer dropdowns.

CSV export is done in the browser from this response (no extra endpoint needed).
