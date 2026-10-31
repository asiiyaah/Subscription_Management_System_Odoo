# AI Assistant API contract (frontend ↔ AI service)

For **Member 3** (AI service: Gemini + tool calling). The frontend is built against this shape and uses a mock until
`VITE_USE_MOCKS=false`. TypeScript source of truth: `frontend/src/types/ai.ts`.

## Principles

1. **The model never writes to the database directly.** It calls backend tools (Python functions); numbers in replies
   come from tool results, not the model.
2. **Consequential actions need approval.** Sending reminders or creating invoices returns a `pending_action`; nothing
   happens until an **admin** calls approve. Staff can ask questions but get **403** on approve.
3. Every tool the model called is returned in `tool_calls`, so the UI can show what was looked up.

## POST `/api/ai/chat`

```json
// request
{ "message": "Which subscriptions expire this week?", "conversation_id": "conv_abc123" }   // omit id to start a new chat

// 200
{
  "conversation_id": "conv_abc123",
  "reply": {
    "id": "msg_9f2",
    "content": "**4 subscriptions** expire in the next 7 days, worth **₹6,245/month**.\n\nThe most urgent is **Kochi Coffee Co.** …",
    "tool_calls": [
      { "id": "tool_1", "name": "get_expiring_subscriptions", "args": { "days": 7 }, "status": "success", "summary": "4 found" }
    ],
    "data": { "kind": "table", "...": "see below" },
    "pending_action": null,
    "suggestions": ["Prepare renewal reminders for them", "Show expiring in the next 30 days"]
  }
}
```

- `content`: markdown-lite only — `**bold**`, line breaks, blank line between paragraphs, `- ` bullet lines. No HTML.
- `tool_calls[].status`: `success` | `error`; `summary` is a short human result ("4 found").
- `data` and `pending_action` are optional; `suggestions` (0–3 follow-up questions) is optional.
- Errors: `{ "detail": "..." }` with 4xx/5xx — shown in the chat with a "Try again" button. The UI waits up to 60 s.

### `data` — structured result (pick one `kind`)

```json
{ "kind": "table", "title": "Overdue invoices",
  "columns": [ { "key": "number", "label": "Invoice" },
               { "key": "due_date", "label": "Due", "format": "date" },
               { "key": "balance", "label": "Balance", "format": "currency", "align": "right" } ],
  "rows": [ { "id": 12, "number": "INV-2026-0012", "due_date": "2026-09-29", "balance": 2357.64 } ],
  "link": { "base": "/invoices/", "key": "id" } }
```
`format`: `text` (default) · `currency` (₹) · `date` (YYYY-MM-DD) · `number` · `status` (badge). `link` makes the first
column a link to `base + row[key]` — use `/invoices/` or `/subscriptions/`.

```json
{ "kind": "metrics", "title": "Revenue summary",
  "items": [ { "label": "MRR", "value": 48210.5, "format": "currency", "hint": "after discounts, before tax" } ] }
```

```json
{ "kind": "bar_chart", "title": "Revenue collected by plan", "format": "currency",
  "bars": [ { "label": "Pro Monthly", "value": 51203, "hint": "4 subs · ₹12,987/mo" } ] }
```

### `pending_action`

```json
{
  "id": "act_7c1",
  "type": "send_renewal_reminders",          // or "generate_invoices"
  "title": "Send 4 renewal reminders",
  "description": "Emails go to each customer's billing address.",
  "preview": [ { "label": "Acme Retail · billing@acmeretail.in", "detail": "Basic Monthly (SUB-0001) ends in 3 days" } ],
  "confirm_label": "Approve & send"
}
```
Store the prepared action server-side under `id` (with what it will do) so approve runs exactly what was previewed.

## POST `/api/ai/actions/{id}/approve` (admin only)

→ `{ "status": "completed", "message": "4 renewal reminders sent" }`
**404** if the action expired or was already handled · **403** for non-admins.
`generate_invoices` must reuse the normal billing run (`POST /api/invoices/generate-due` logic) so it never double-bills.

## POST `/api/ai/actions/{id}/reject`

→ `{ "status": "rejected", "message": "Cancelled — nothing was sent or created." }`

## Tools the UI expects to see (names shown to users)

| Tool | Answers | Returns `data` |
|---|---|---|
| `get_expiring_subscriptions(days)` | "Which subscriptions expire this week?" | table → `/subscriptions/` |
| `prepare_renewal_reminders(count)` | "Prepare renewal reminders" | `pending_action: send_renewal_reminders` |
| `get_subscriptions_due_for_billing()` + `create_invoice_drafts(dry_run)` | "Generate invoices due today" | `pending_action: generate_invoices` |
| `get_overdue_invoices()` | "Show overdue invoices" | table → `/invoices/` |
| `get_revenue_summary()` | "What is our MRR?" | metrics |
| `get_revenue_by_plan()` | "Which plan generates the most revenue?" | bar_chart |
| `get_outstanding_by_customer()` | "Which customers owe us the most?" | table |

The mock in `frontend/src/mocks/ai.ts` shows example replies for each.
