# Prompt — Customer portal upgrade & frontend polish

> Paste everything below the line into your AI coding assistant (or hand it to a developer).
> It is written against the current code in this repo.

---

You are a senior frontend engineer working on **SubscriptIQ**, a subscription management app (React 19 + TypeScript +
Vite + Tailwind v4 + TanStack Query + React Router + Recharts, FastAPI backend). Your job has two parts:

1. **Make the customer portal genuinely useful and delightful** — the part customers of the business use.
2. **Polish the whole frontend** so it feels like a finished product, not a hackathon prototype.

Read these first: `frontend/docs/FRONTEND_PAGES.md`, `frontend/docs/PROBLEM_STATEMENT.md` (the brief, requirements
R1–R39), `frontend/docs/BACKEND_INTEGRATION.md`, `frontend/docs/MEMBER1_HANDOFF.md`, and the dev-only UI kit at
`/ui-kit` (`src/pages/dev/UiKit.tsx`).

## How the code works — follow these rules

- **Folders & ownership.** Portal pages live in `src/pages/portal/` with routes in `pages/portal/routes.tsx`, rendered
  inside `src/layouts/PortalLayout.tsx`. `pages/portal/subscriptions/` belongs to **Frontend Member 1** — don't
  rewrite it; if a task needs it, build reusable pieces in `components/portal/` and leave a note for her.
- **Data layer.** Pages never call axios. They use a service in `src/services/*Service.ts` through TanStack Query.
  Every service supports **mock mode** (`src/mocks/*`) and **live mode** (`isLive("<module>")` from
  `services/api.ts`, switched on by `VITE_LIVE_APIS` in `frontend/.env`). Any new service method needs both, and a
  small adapter for backend quirks (UUID string ids, decimal strings → `num()`, `null` → `undefined`).
- **Money is never calculated in the frontend** — totals, taxes, discounts, balances come from the API. Display-only
  transforms (running totals for a chart, percentages) are fine.
- **Shared components first**: `DataTable` + `useListQuery`, `Tabs`, `StatusBadge`, `SummaryCard`, `PageHeader`,
  `EmptyState`/`ErrorState`/`Skeleton`, `Dialog`/`ConfirmDialog`, `Button`, `TextField`, `Select`, `Switch`,
  `SegmentedControl`, `useToast`, `lib/format.ts` (`formatCurrency`, `formatDate`, `toIsoDate`), chart pieces in
  `components/reports/`. Extend them rather than duplicating.
- **Theme**: dark plum + magenta + pink→orange gradient. Use the Tailwind tokens in `src/index.css` (`bg-surface`,
  `text-muted`, `border-line`, `text-primary`, `from-primary to-accent`…), never raw hex in components. Chart colours
  come from `lib/chartTheme.ts` (already validated for colour-blind readers).
- **Every page** has loading, empty and error states, works at **400 px** wide with no page-level horizontal scroll,
  keyboard focus is visible, and actions confirm with a toast.
- **Security (R6)**: customers only ever see their own data. The backend scopes everything by the login token;
  never pass a customer id from the portal.
- Run `npx tsc -b` and `npm run build` before finishing. **Do not commit.** Add a manual test section to
  `frontend/docs/TESTING_GUIDE.md` for everything you build (flows + checkboxes, like the existing sections).

## Part 1 — Customer portal features (priority order)

### 1. Pay an invoice, the easy way ⭐
Today "How to pay" only lists UPI/bank text. Make paying effortless:
- On an unpaid invoice (`pages/portal/MyInvoiceDetail.tsx`) and the "Next payment" card, add a **Pay now** panel:
  - **UPI QR code** for the exact balance: `upi://pay?pa=<upi>&pn=<company>&am=<balance>&cu=INR&tn=<invoice number>`
    (generate client-side with a small pinned library such as `qrcode`; seller details from
    `useBusinessSettings()`).
  - **Copy buttons** for UPI ID, account number, IFSC and the payment reference (invoice number), with a "Copied" toast.
  - On phones, an **"Open UPI app"** link using the same `upi://` URL.
- Keep the honest note that payments appear once the team records them.

### 2. Payment history & receipts
- New page **`/portal/payments`** (add "Payments" to the portal nav) listing the customer's payments:
  date, amount, method, invoice (link), reference. Backend already has `GET /api/portal/payments`
  (paginated, rows like `/api/payments`). Add `portalService.payments()` with a mock.
- Each payment opens a **printable receipt** (reuse the invoice print styles: `invoice-doc` class + `print:hidden`).

### 3. A richer Portal Home
Rework `pages/portal/PortalHome.tsx` into a real account overview:
- **Hero "Next payment" card**: amount, due date with a countdown ("due in 5 days" / "3 days overdue"), and the
  Pay now / View invoice actions. Calm green "You're all paid up 🎉" state when nothing is owed.
- **Renewal heads-up**: a banner when any subscription ends within 14 days ("Your Pro Monthly plan ends on 12 Nov").
- **Spending chart**: last 6 months invoiced vs paid (two series → `MonthlyBars` from `components/reports/`), computed
  from the customer's own invoices (display-only grouping).
- **Quick actions** row: Pay latest invoice · Download latest invoice · Payment history · Contact us.
- Keep "Your subscriptions" and "Recent invoices", but use the shared `StatusBadge` and show the plan name when the
  API provides it (fallback: subscription number — current behaviour).

### 4. Browse plans & request one (self-service quote)
- New page **`/portal/plans`**: cards for active plans grouped by product (name, price, billing period, minimum
  quantity, what's included from the description). Customers can already read `GET /api/plans`.
- **"Request this plan"** opens a dialog (quantity ≥ plan minimum, optional note) → creates a **draft subscription**
  for the signed-in customer via `POST /api/subscriptions` with `status: "draft"` (the backend allows customers to
  create their own drafts; get the customer id from `GET /api/portal/profile` → `id`). Use
  `POST /api/subscriptions/preview` to show the price before submitting.
- Success: "Request sent — our team will confirm it" and it appears under My subscriptions as Draft.
- New customers with no subscriptions get an empty state that points here ("Browse plans").

### 5. Statement of account
- On My invoices: **"Download statement"** for a date range → a printable page listing invoices, payments and the
  running balance for that period (display-only running balance from API amounts), with the business header.

### 6. Help & contact
- A **"Need help?"** card (portal home + invoice page): business email and phone from settings, shown as text with a
  copy button; plus a short FAQ (How do I pay? When will my payment show? How do I change my plan?).

### 7. Small but noticeable
- Portal **bottom navigation bar on phones** (Home · Invoices · Payments · Profile), top nav on desktop.
- Remember the last-used invoice filter tab (URL already stores it — make the nav link keep it).
- Friendly first-visit tooltip on the Pay now panel (dismiss once, `localStorage` with try/catch).

> Subscription self-service (pause / resume / renew / close, `POST /api/portal/subscriptions/{id}/{action}`) belongs to
> Member 1's My subscriptions pages — if you build a reusable `SubscriptionActions` component for it, put it in
> `components/portal/` and document how she plugs it in.

## Part 2 — Frontend polish (whole app)

1. **404 and error pages** — `AppRoutes.tsx` currently redirects unknown URLs to `/`. Add a themed **404** page
   (with a button home for the user's role: `/` or `/portal`), a **403** page, and a top-level **error boundary**
   that shows a friendly "Something went wrong — Reload" instead of a blank screen.
2. **Login page left panel** — replace the made-up numbers (₹1,24,500 MRR, 42 invoices due) with three feature
   highlights without fake data: Automatic billing · Payment tracking · AI assistant.
3. **Performance** — the main JS bundle is ~570 kB. Lazy-load route groups with `React.lazy` + `Suspense`
   (Reports already is — copy `pages/reports/routes.tsx`), with a consistent page skeleton fallback. Target: main
   chunk < 300 kB, no Vite size warning. Prefetch a route's chunk on nav-link hover.
4. **Visual consistency pass** — same page header spacing, card padding (`p-5`/`p-6`), section gaps (`space-y-6`),
   border radius (`rounded-2xl` cards, `rounded-xl` controls) and heading sizes on every page; align numbers with
   `tabular-nums`; replace any leftover ad-hoc colours with tokens.
5. **Accessibility pass** — check `text-muted` contrast on `bg-surface` (≥ 4.5:1 for body text, adjust the token if
   needed); every icon-only button has `aria-label`; focus rings visible everywhere; dialogs trap focus (they do —
   keep it); charts have a text/table alternative.
6. **Motion** — subtle and consistent: `animate-fade-up` for new content, 150–200 ms hover transitions, respect
   `prefers-reduced-motion` (already in `index.css`).
7. **Fix the Vite warning** in `vite.config.ts`: use `import.meta.dirname` instead of `__dirname`.

## Optional (needs small backend additions — write the request, don't change the backend)

- **"I've paid" notice**: customer submits UTR/reference + amount + date for an unpaid invoice →
  `POST /api/portal/invoices/{id}/payment-notices`; staff see a "Payment notices" list and confirm it into a real
  payment. Write the API contract in `frontend/docs/` and build the UI behind a capability flag.
- **Email preferences** in Profile (invoice emails on/off, reminders on/off) → needs fields on the customer.
- **Plan names in `/api/portal/subscriptions`** (currently missing) — one line in `routers/portal.py`.

## Deliverables

- [ ] Features 1–7 of Part 1 (or as many as time allows, in order), each working in mock **and** live mode
- [ ] Part 2 items 1–7
- [ ] New/changed services have mocks + live adapters; new API needs written as contracts in `frontend/docs/`
- [ ] `TESTING_GUIDE.md` updated with flows and checkboxes for everything new
- [ ] `npx tsc -b` and `npm run build` pass, no new console errors, nothing committed
- [ ] A short summary listing what changed, what's mock-only, and anything Member 1 or the backend needs to do
