# Discounts, taxes & product lookup — API contract (frontend expectations)

Used when `VITE_USE_MOCKS=false`. Types: `frontend/src/types/discount.ts`, `frontend/src/types/tax.ts`.
Dates are `YYYY-MM-DD`; money in rupees; errors use `{ "detail": "message" }`.
**Create / update / delete require the admin role** (R27) — return **403** for staff. Staff may call the GET endpoints.

## Discounts

### Discount object

```json
{
  "id": 1, "code": "SEATS10", "name": "10% off for 5+ seats",
  "type": "percentage", "value": 10,
  "min_purchase": null, "min_quantity": 5,
  "start_date": "2026-07-03", "end_date": null,
  "usage_limit": 100, "used_count": 23,
  "applies_to": "subscription", "product_ids": [], "product_names": [],
  "active": true, "status": "active"
}
```

- `type`: `percentage` (value 0–100) | `fixed` (value in ₹).
- `applies_to`: `subscription` (whole subscription) | `products` (only lines whose product is in `product_ids`).
- `min_purchase`, `min_quantity`, `end_date`, `usage_limit`: optional — omit / `null` means "no limit".
- `status` is **computed by the backend**, in this order:
  `inactive` (active = false) → `used_up` (used_count ≥ usage_limit) → `expired` (end_date < today) → `scheduled` (start_date > today) → `active`.
- Only `active` discounts are applied to new invoices; the backend increments `used_count` each time one is applied (R33).

### Endpoints

| Method & path | Notes |
|---|---|
| `GET /api/discounts` | Paginated (`items/total/page/page_size`). Params: `page`, `page_size`, `search` (code/name), `sort_by`, `sort_dir`, `status`. |
| `GET /api/discounts/counts` | `{ "all": 7, "active": 3, "scheduled": 1, "expired": 1, "used_up": 1, "inactive": 1 }` |
| `POST /api/discounts` | Body = discount object without `id`, `used_count`, `product_names`, `status`. Code is stored uppercase. **409** if the code exists. **422** for percentage > 100, end before start, or `products` with no `product_ids`. |
| `PUT /api/discounts/{id}` | Same body. **422** if `usage_limit` < `used_count`. |
| `PATCH /api/discounts/{id}` | `{ "active": false }` — deactivate / activate. |
| `DELETE /api/discounts/{id}` | **409** if `used_count > 0` (keep it for invoice history; deactivate instead). |
| `POST /api/discounts/validate` | For the subscription form — see below. |

### POST `/api/discounts/validate`

```json
// request
{ "code": "SEATS10", "subtotal": 4995, "quantity": 5, "product_ids": [1] }

// 200 — valid
{ "valid": true, "discount": { "id": 1, "code": "SEATS10", "name": "10% off for 5+ seats", "type": "percentage", "value": 10, "applies_to": "subscription", "product_ids": [] } }

// 200 — not valid (always 200; the reason is shown to the user)
{ "valid": false, "reason": "Needs at least 5 seats/units." }
```
The discount **amount** is calculated by the subscription/invoice preview, not here.

## Taxes (admin only)

### Tax rule object

```json
{ "id": 1, "name": "GST 18%", "type": "percentage", "rate": 18,
  "applies_to": "all", "product_ids": [], "product_names": [],
  "is_default": true, "active": true }
```

- `type`: `percentage` (rate in %) | `fixed` (₹ per unit).
- `name` is what appears on invoice lines (`tax_label`).
- **How the backend picks taxes for a line:** every *active* rule with `applies_to = products` that lists the line's product;
  if none, the **default** rule. Exactly one rule is the default, and it is always active.

| Method & path | Notes |
|---|---|
| `GET /api/taxes` | Plain array (not paginated), default first. |
| `POST /api/taxes` | Body = rule without `id`, `product_names`. If `is_default: true`, the previous default is cleared. **409** duplicate name. |
| `PUT /api/taxes/{id}` | Same body. **422** if it would leave no default (unsetting `is_default` on the current default). |
| `POST /api/taxes/{id}/default` | Make this the default. **422** if the rule is inactive. |
| `PATCH /api/taxes/{id}` | `{ "active": false }`. **422** for the default rule. |
| `DELETE /api/taxes/{id}` | **409** for the default rule. Issued invoices keep their taxes. |

## Product lookup

`GET /api/products/options` → `[{ "id": 1, "name": "Project Management Suite" }, …]` — active products, for the
"specific products" pickers. (Full product CRUD belongs to the Products module.)
