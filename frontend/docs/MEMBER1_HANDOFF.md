# Frontend Member 1 — Handoff

Hi! This is everything you need to start on your pages without waiting for me (Member 2) or the backend.
Full page specs are in [FRONTEND_PAGES.md](./FRONTEND_PAGES.md); the brief's requirements (R1–R39) are in [PROBLEM_STATEMENT.md](./PROBLEM_STATEMENT.md).

---

## 1. Who owns what

### You — Core Management

| Module | Folder | Spec in FRONTEND_PAGES.md | Brief reqs |
|---|---|---|---|
| Dashboard | `pages/dashboard/` | A1 | R36, R37 |
| Customers + customer detail | `pages/customers/` | A5, A5a | — |
| Products + variants | `pages/products/` | A2, A2a | R8, R9, R14 |
| Plans | `pages/plans/` | A3 | R10–R13 |
| Subscriptions (list, form, detail, lifecycle actions) | `pages/subscriptions/` | A6, A6a, A6b | R17–R21 |
| Quotation templates | `pages/subscriptions/` (or `pages/quotation-templates/`) | A4 | R15, R16 |
| Customer portal — My Subscriptions | `pages/portal/subscriptions/` | C2, C2a | R6 |
| Chart components | `components/charts/` | — | — |

### Me — Finance, Intelligence & Shell

Login / Sign up / Forgot / Reset password ✅ done · App shell (sidebar, header, routing) ✅ basic version done · Invoices · Payments · Discounts · Taxes · AI Assistant · Reports · Users & Staff · Settings · Customer portal shell + My Invoices.

### Shared (tell the other person before changing)

`components/ui/` · `components/common/` · `services/api.ts` · `src/index.css` · `routes/AppRoutes.tsx` · `package.json`

---

## 2. Getting started

```bash
git pull
cd frontend
npm install
cp .env.example .env      # VITE_USE_MOCKS=true → no backend needed
npm run dev               # http://localhost:5173
```

Log in with the **Admin** demo button on the login page. Your pages are already in the sidebar, showing an "under construction" placeholder — replace those.

| Demo account | Email | Password |
|---|---|---|
| Admin | admin@subscriptiq.com | Admin@1234 |
| Staff | staff@subscriptiq.com | Staff@1234 |
| Customer | customer@acmeretail.in | Customer@1234 |

Before pushing: `npm run build` must pass (it runs the TypeScript check).

---

## 3. How the code is organised

```
src/
├── routes/AppRoutes.tsx      ← Member 2. Imports each module's routes. You don't need to edit it.
├── layouts/AdminLayout.tsx   ← Member 2. Sidebar + header; your pages render inside it.
├── pages/
│   ├── dashboard/   ┐
│   ├── customers/   │  YOURS — each has a routes.tsx + page files
│   ├── products/    │
│   ├── plans/       │
│   ├── subscriptions/┘
│   ├── invoices/ payments/ discounts/ ai/ reports/ auth/   ← mine
├── components/
│   ├── ui/          Button, TextField, Alert (shared)
│   ├── common/      Logo, Sidebar, Header, navItems, PagePlaceholder (shared)
│   ├── charts/      ← yours: StatCard, RevenueChart, StatusDonut, PlanBars…
│   └── <module>/    ← component folder per module (e.g. components/subscriptions/)
├── services/        api.ts (shared) + one service file per module
├── mocks/           mock data per module
├── types/           one types file per module (customer.ts, subscription.ts…)
├── context/         AuthContext — useAuth() gives you { user, logout }
└── lib/             cn(), password rules, token storage
```

### Adding a page (no App.tsx edits)

Each module has a `routes.tsx`. To add a detail page, edit **your** routes file only:

```tsx
// pages/customers/routes.tsx
import type { RouteObject } from "react-router-dom";
import Customers from "./Customers";
import CustomerDetail from "./CustomerDetail";

export const customerRoutes: RouteObject[] = [
  { path: "customers", element: <Customers /> },
  { path: "customers/:id", element: <CustomerDetail /> },
];
```

Paths are relative (no leading `/`). The dashboard uses `{ index: true }` because it lives at `/`.
New sidebar entry? Add one line to `components/common/navItems.ts` and tell me.

---

## 4. Data: mocks first, real API later

The backend isn't ready, so every page reads from a **service** that returns mock data now and calls the API later. Copy the pattern from `services/authService.ts` + `mocks/auth.ts`:

```ts
// types/customer.ts
export interface Customer { id: number; name: string; email: string; phone?: string; company?: string;
  active_subscriptions: number; outstanding_amount: number; created_at: string; }
export interface Paginated<T> { items: T[]; total: number; page: number; page_size: number; }
```

```ts
// services/customerService.ts
import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockCustomers } from "@/mocks/customers";
import type { Customer, Paginated } from "@/types/customer";

export interface CustomerQuery { page?: number; page_size?: number; search?: string; }

export const customerService = {
  async list(params: CustomerQuery): Promise<Paginated<Customer>> {
    if (USE_MOCKS) return mockCustomers.list(params);
    try {
      return (await api.get("/api/customers", { params })).data;
    } catch (e) {
      throw toApiError(e);
    }
  },
};
```

```tsx
// in the page — TanStack Query handles loading/error/caching
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: ["customers", params],
  queryFn: () => customerService.list(params),
});
```

Use `useMutation` for create/update/actions, then `queryClient.invalidateQueries({ queryKey: ["customers"] })`.

**Rules**
- **Lists are paginated on the server** (`page`, `page_size`, `search`, filters as query params). The brief requires < 2 s with thousands of subscriptions (R39) — never fetch everything.
- **Never calculate money in the frontend.** Prices, variant extras, taxes, discounts and totals come from the API (use a `/preview` endpoint for the subscription form). Mocks can fake the numbers.
- Every page needs a **loading** state, an **empty** state and an **error** state with Retry.
- Agree the request/response shape with the backend dev and write it in `docs/api-contracts.md` (repo root) — see `frontend/docs/API_AUTH_CONTRACT.md` for the format.

---

## 5. Design system

We're using the **dark plum / magenta / pink→orange** theme (ignore any light/navy/indigo palette from older notes). Tokens live in `src/index.css` — use the Tailwind classes, never raw hex codes:

| Class | Use for |
|---|---|
| `bg-bg` | page background |
| `bg-surface` / `bg-surface-2` | cards / inputs, hover rows |
| `border-line` | borders |
| `text-ink` / `text-muted` | main / secondary text |
| `text-primary`, `bg-primary` | hot pink — links, active |
| `bg-gradient-to-r from-primary to-accent` | signature gradient (primary buttons, chart fills, progress bars) |
| `text-success` / `text-danger` / `text-warning` / `text-violet` | status colours |

- Cards: `rounded-2xl border border-line bg-surface p-5`
- Font: Plus Jakarta Sans (already loaded). Icons: `lucide-react`.
- **Shared components are ready** — open **http://localhost:5173/ui-kit** (dev only) to see each one working, and copy the code from `src/pages/dev/UiKit.tsx`:

  | Component | Import from | Use for |
  |---|---|---|
  | `DataTable` + `useListQuery` | `components/common/DataTable`, `hooks/useListQuery` | Every list page — search, sort, filters, pagination, row "⋯" menu, loading/empty/error |
  | `Tabs` | `components/common/Tabs` | Status tabs with counts above a list |
  | `StatusBadge` | `components/common/StatusBadge` | Any status string (draft, active, paid, overdue…) |
  | `PageHeader` | `components/common/PageHeader` | Title + description + action buttons (+ back link on detail pages) |
  | `EmptyState`, `ErrorState`, `Skeleton` | `components/common/States` | Cards and detail pages |
  | `Button` (`primary`/`secondary`/`ghost`/`danger`, `size="sm"`) | `components/ui/Button` | All buttons |
  | `TextField`, `Select`, `Textarea` | `components/ui/…` | Forms |
  | `Dialog`, `ConfirmDialog` | `components/ui/…` | Create/edit forms, "Are you sure?" |
  | `useToast()` | `components/ui/Toast` | `toast.success("Customer saved")` after actions |
  | `paginate`, `mockDelay` | `mocks/utils` | Make your mock lists behave like the paginated API |
  | `formatCurrency`, `formatDate`, `formatRelativeDays` | `lib/format` | ₹ amounts and dates |
  | `Paginated<T>`, `ListQuery` | `types/common` | Service return/param types |

- Need a new shared component? Message me first so we don't both build it.
- Check every page at phone width (~400px).

**Status colours** (subscriptions use these exact names, from the brief):
Draft → muted · Quotation → violet · Confirmed → blue · Active → success · Paused → accent · Closed → grey.

---

## 6. Git workflow

```bash
git checkout main && git pull
git checkout -b frontend-member-1
# work only in your folders…
git add <your files>
git commit -m "feat(customers): add customer list with search"
git push -u origin frontend-member-1
```

- **Commit format:** `type(scope): summary` — types: `feat`, `fix`, `style`, `refactor`, `docs`, `chore`. Scope = module name.
- Merge `main` into your branch often (`git merge main`) and open a PR to `main` when a module works.
- **Don't edit** `App.tsx`, `AppRoutes.tsx`, `index.css`, `package.json` or `components/ui|common/` without telling me.
- **Never run** `git reset --hard`, `git filter-branch` or force-push with uncommitted work — it silently wipes files.

---

## 7. Where our modules connect

| Connection | Agreement |
|---|---|
| Subscription detail shows its invoices | ✅ Ready: `import { InvoiceTable } from "@/components/invoices/InvoiceTable"` then `<InvoiceTable subscriptionId={id} />` (or `customerId={id}`). Row actions included. |
| Subscription form applies a discount code | ✅ Ready: `discountService.validate({ code, subtotal, quantity, product_ids })` from `services/discountService.ts` returns `{ valid: true, discount }` or `{ valid: false, reason }` — show `reason` under the code field. Try `SEATS10` (needs 5+ seats) or `WELCOME500` (needs ₹1,999+). |
| Product pickers | `lookupService.products()` (`services/lookupService.ts`) returns `{ id, name }[]`. When your `productService` exists, point the mock at your product data so names stay in sync. |
| Customer detail → Invoices / Payments tabs | Same: use my `InvoiceTable` / `PaymentTable` with a `customerId` prop. |
| Dashboard overdue invoices card | Read from `/api/analytics/*` (yours); "View all" links to `/invoices?overdue=true` (mine). |
| Invoices link back to subscriptions | I'll link to `/subscriptions/:id` — please keep that route. |

---

## 8. Suggested order

1. **Customers** list + create/edit dialog — proves the service/mock/query pattern.
2. **Products** + variants → **Plans** (with billing period, min qty, availability dates, plan options).
3. **Subscriptions** list with status tabs → form with order lines → detail with lifecycle stepper.
4. **Dashboard** with your chart components.
5. **Quotation templates**, portal My Subscriptions.
