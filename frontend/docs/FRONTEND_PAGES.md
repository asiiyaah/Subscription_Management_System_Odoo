# SubscriptIQ — Frontend Pages Plan

> Every page we are building, what it contains, who can see it, and which API it calls.
> Requirement IDs (R1–R39) refer to the checklist in [PROBLEM_STATEMENT.md](./PROBLEM_STATEMENT.md).
> Stack: React + TypeScript + Vite + Tailwind CSS + shadcn/ui + React Router + TanStack Query + Axios + Recharts + Lucide.

---

## 0. Ground rules

1. **Frontend displays, backend decides.** Prices, taxes, discounts, totals, invoice status and duplicate checks are calculated by the backend. The frontend never computes money; it only shows what the API returns.
2. **Mock first.** Every page is built against mock data shaped exactly like the API contract, then switched to the real API (`USE_MOCKS` flag in the service layer).
3. **Server-side lists (R39).** Every list page sends `page`, `page_size`, `search`, `status` and filter params to the API. We never load thousands of rows into the browser.
4. **Role-aware UI (R5).** Routes and sidebar items are hidden from roles that can't use them. The backend still enforces permissions; hiding is for UX only.
5. **Every page has** a loading skeleton, an empty state, an error state with Retry, and success/error toasts after actions.

---

## 1. Theme

Taken from the reference dashboard image (dark plum + magenta + pink→orange gradient).

| Token | Value | Used for |
|---|---|---|
| `bg` | `#1a0a2e` | Page background |
| `surface` | `#2a1045` | Cards, tables |
| `surface-2` | `#3a1657` | Inputs, hover rows |
| `border` | `#4a1f6b` | Card and table borders |
| `primary` | `#ff2e93` | Hot pink — primary buttons, active states |
| `accent` | `#ff8a3d` | Orange — gradient end, highlights |
| `violet` | `#9b3cff` | Secondary charts, info |
| `text` | `#f5e9ff` | Main text |
| `muted` | `#b9a3cf` | Labels, secondary text |
| `success` | `#2ee6a6` | Paid, Active |
| `danger` | `#ff4d6d` | Overdue, errors |

- **Signature gradient:** `from-primary to-accent` (buttons, chart fills, progress bars).
- **Sidebar:** vertical magenta gradient `#e0218a → #9b1b8f`, white icons, active item as a highlighted pill.
- **Charts:** area charts with pink→orange gradient fill; ring/donut charts for status share.

---

## 2. Roles and what they see (R5, R6, R7)

| Area | Admin | Internal staff | Customer (portal) |
|---|---|---|---|
| Dashboard | ✅ | ✅ | ❌ (has Portal Home) |
| Products & variants | ✅ create/edit | 👁 view only | ❌ |
| Plans | ✅ create/edit | 👁 view only | ❌ |
| Taxes | ✅ | ❌ | ❌ |
| Discounts | ✅ create/edit (R27) | 👁 view only | ❌ |
| Quotation templates | ✅ | ✅ use, 👁 view | ❌ |
| Customers | ✅ | ✅ | ❌ |
| Subscriptions | ✅ | ✅ | Own only (portal) |
| Invoices | ✅ | ✅ | Own only (portal) |
| Payments | ✅ | ✅ record | Own only (portal) |
| Reports | ✅ | ✅ | ❌ |
| AI Assistant | ✅ | ✅ (approvals: admin only) | ❌ |
| Users & Staff | ✅ (only admin adds staff, R7) | ❌ | ❌ |
| Settings | ✅ | Profile only | Profile only |

After login, the app redirects by role: **Admin/Staff → `/`** (admin app), **Customer → `/portal`**.

---

## 3. Page list

### Public (no login)

| # | Page | Route | Reqs |
|---|---|---|---|
| P1 | Login | `/login` | R5 |
| P2 | Sign Up | `/signup` | R1, R2, R3 |
| P3 | Forgot Password | `/forgot-password` | R4 |
| P4 | Reset Password | `/reset-password?token=…` | R3, R4 |

### Admin & staff app (inside `AdminLayout`)

| # | Page | Route | Reqs |
|---|---|---|---|
| A1 | Dashboard | `/` | R36, R37 |
| A2 | Products | `/products` | R8, R14 |
| A2a | Product detail (variants) | `/products/:id` | R8, R9 |
| A3 | Plans | `/plans` | R10–R13 |
| A4 | Quotation Templates | `/quotation-templates` | R15, R16 |
| A5 | Customers | `/customers` | — |
| A5a | Customer detail | `/customers/:id` | R35 |
| A6 | Subscriptions | `/subscriptions` | R19, R20 |
| A6a | New / Edit Subscription | `/subscriptions/new`, `/subscriptions/:id/edit` | R15, R17, R18 |
| A6b | Subscription detail | `/subscriptions/:id` | R17–R21 |
| A7 | Invoices | `/invoices` | R22, R25, R26, R35, R36 |
| A7a | Invoice detail | `/invoices/:id` | R23, R24, R33, R34 |
| A8 | Payments | `/payments` | R34 |
| A9 | Discounts | `/discounts` | R27–R33 |
| A10 | Taxes | `/taxes` | R23 |
| A11 | Reports | `/reports` | R37, R38 |
| A12 | AI Assistant | `/assistant` | X1 |
| A13 | Users & Staff | `/users` | R5, R7 |
| A14 | Settings | `/settings` | R3 |

### Customer portal (inside `PortalLayout`)

| # | Page | Route | Reqs |
|---|---|---|---|
| C1 | Portal Home | `/portal` | R6 |
| C2 | My Subscriptions | `/portal/subscriptions` | R6 |
| C2a | My Subscription detail | `/portal/subscriptions/:id` | R6, R21 |
| C3 | My Invoices | `/portal/invoices` | R6 |
| C3a | My Invoice detail | `/portal/invoices/:id` | R6, R24 (print) |
| C4 | My Profile | `/portal/profile` | R3 |

### Other

| # | Page | Route |
|---|---|---|
| O1 | 404 Not Found | `*` |
| O2 | 403 Access Denied | `/forbidden` |

**Total: 4 public + 14 admin pages (+6 detail/form pages) + 4 portal pages (+2 detail pages) + 2 utility pages.**

---

## 4. Page details

### P1. Login — `/login`

- **Purpose:** Sign in for all three roles.
- **Layout:** full-screen plum background with pink/orange glow, centred card with SubscriptIQ logo.
- **Fields:** Email, Password (show/hide toggle).
- **Links:** "Forgot password?" → `/forgot-password`, "Create an account" → `/signup`.
- **Behaviour:** `POST /api/auth/login` → `{ access_token, user: { id, name, email, role } }`. Store token, redirect by role. Wrong credentials → inline error. Button shows spinner while loading.
- **Demo:** pre-fill demo admin credentials.

### P2. Sign Up — `/signup` (R1, R2, R3)

- **Purpose:** A new customer creates an account (role = Customer).
- **Fields:** Full name, Email, Phone (optional), Company (optional), Password, Confirm password.
- **Password rules (R3)** shown as a live checklist that ticks green as the user types:
  - ☐ More than 8 characters
  - ☐ At least one uppercase letter
  - ☐ At least one lowercase letter
  - ☐ At least one special character
  - Submit is disabled until all are ticked and both passwords match.
- **Unique email (R2):** if the API returns 409, show "This email is already registered. Log in instead?"
- **API:** `POST /api/auth/signup` → then redirect to `/login` with "Account created" toast (or auto-login).

### P3. Forgot Password — `/forgot-password` (R4)

- **Field:** Email.
- **Behaviour:** `POST /api/auth/forgot-password`. Always show the same message: "If this email is registered, a reset link has been sent." (Doesn't reveal whether an account exists.)

### P4. Reset Password — `/reset-password?token=…` (R3, R4)

- **Fields:** New password, Confirm password, with the same live rule checklist as Sign Up.
- **Behaviour:** `POST /api/auth/reset-password { token, new_password }`. Expired/invalid token → error with link back to Forgot Password. Success → redirect to Login.

---

### A1. Dashboard — `/` (R36, R37)

The page modelled most closely on the reference image.

- **Header row:** "Welcome back, {name}" + period selector (This week / This month / This year).
- **KPI cards (5):**
  | Card | Example |
  |---|---|
  | Active Subscriptions | 128 |
  | Monthly Recurring Revenue (MRR) | ₹1,24,500 |
  | Revenue collected (period) | ₹96,300 |
  | Outstanding amount | ₹38,200 |
  | Overdue invoices | 7 |
  Each with a small trend (↑ 8% vs last period).
- **Charts row:**
  - Revenue over time — area chart, pink→orange gradient (≈2/3 width).
  - Subscription status — donut/ring: Draft / Quotation / Confirmed / Active / Closed (≈1/3 width).
- **Lists row:**
  - Revenue by plan — gradient progress bars.
  - Overdue invoices — top 5 (customer, amount, days overdue) → "View all" `/invoices?overdue=true`.
  - Expiring soon — top 5 subscriptions with "Renew" quick action.
  - Recent activity timeline.
- **AI quick box:** "Ask SubscriptIQ AI…" input + 3 suggestion chips → opens `/assistant` with the question.
- **APIs:** `GET /api/analytics/summary`, `/api/analytics/revenue`, `/api/analytics/status-breakdown`, `/api/analytics/revenue-by-plan`, `/api/analytics/recent-activity`, `GET /api/invoices?overdue=true&page_size=5`, `GET /api/subscriptions/expiring?days=7`.

---

### A2. Products — `/products` (R8, R14)

- **Header:** "Products" + **+ New Product** (admin only).
- **Filters:** search, type (Service / Software / Add-on / Physical), status (Active / Archived).
- **Table columns:** Name · Type · Sales price · Cost price · Variants count · Plans count · Status · Actions.
- **Create/Edit dialog (R8):**
  - Name *(required)*
  - Type *(select: Service, Software, Add-on, Physical)* — Add-on covers "add-ons customers switch on and off" (R14)
  - Sales price *(₹, required)*
  - Cost price *(₹)*
  - Notes *(textarea)*
  - Status
- **Row click** → Product detail.
- **APIs:** `GET /api/products`, `POST /api/products`, `PUT /api/products/{id}`.

### A2a. Product detail — `/products/:id` (R8, R9)

- **Top card:** product info + Edit.
- **Variants section (R9):**
  - **Attributes** — e.g. *Brand* with values *Odoo, Generic*.
  - Each attribute value has an **extra price** — e.g. Brand = Odoo → **+₹560**.
  - Table: Attribute · Value · Extra price · Actions. "+ Add attribute / value" (admin only).
  - **Price preview:** select values → shows "Base ₹X + Odoo ₹560 = ₹Y" (total returned by the API).
- **Plans using this product** — list with link to Plans.
- **APIs:** `GET /api/products/{id}`, `POST /api/products/{id}/attributes`, `PUT/DELETE /api/product-attribute-values/{id}`.

---

### A3. Plans — `/plans` (R10–R13)

- **Header:** "Plans" + **+ New Plan** (admin only).
- **Filters:** product, billing period, availability (Available now / Upcoming / Ended).
- **View:** pricing **cards** (default) or **table** toggle.
  - Card: plan name, gradient price tag, "per month/year…", product, min quantity, availability dates, option badges (Auto-close · Pausable · Renewable · Closable), active subscriber count.
- **Create/Edit form:**
  - Product *(select)*
  - Plan name *(required)*
  - Price *(₹, required)*
  - **Billing period (R10):** Daily · Weekly · Monthly · Yearly
  - **Minimum quantity (R11)** *(number ≥ 1)*
  - **Available from / Available until (R12)** *(dates)*
  - **Plan options (R13)** — toggles:
    - Auto-close when the plan ends
    - Can be closed early
    - Can be paused
    - Can be renewed
  - Description
- **APIs:** `GET /api/plans`, `POST /api/plans`, `PUT /api/plans/{id}`.

---

### A4. Quotation Templates — `/quotation-templates` (R15, R16)

- **Purpose:** Reusable offers so a sales rep doesn't build a quote from scratch.
- **List columns:** Template name · Plan · No. of lines · Validity (days) · Last used · Actions (Edit, Use, Delete).
- **Create/Edit form:**
  - Template name
  - Plan *(select)*
  - **Validity (days) (R16)** — e.g. 30
  - Payment terms (e.g. Immediate / Net 15 / Net 30)
  - **Product lines** (editable table): Product · Variant · Quantity · Unit price (from product, read-only) · Taxes
  - Notes / terms text
- **"Use template"** → opens `/subscriptions/new?template={id}` with everything prefilled.
- **APIs:** `GET/POST/PUT/DELETE /api/quotation-templates`.

---

### A5. Customers — `/customers`

- **Header:** "Customers" + **+ New Customer**.
- **Search:** name, email, phone, company.
- **Table columns:** Name · Email · Phone · Company · Active subscriptions · Outstanding amount (red if > 0) · Portal access (✓ / Invite) · Actions.
- **Create/Edit dialog:** Name, Email (unique), Phone, Company, Billing address.
- **"Invite to portal"** action → sends the customer a link to set a password (uses the same reset-password flow).
- **APIs:** `GET /api/customers`, `POST /api/customers`, `PUT /api/customers/{id}`, `POST /api/customers/{id}/invite`.

### A5a. Customer detail — `/customers/:id`

- **Profile card** with contact info + Edit.
- **Mini stats:** total paid, outstanding, active subscriptions, customer since.
- **Tabs:** Subscriptions (+ New Subscription prefilled) · Invoices · Payments · Activity timeline.
- **API:** `GET /api/customers/{id}` (+ filtered lists).

---

### A6. Subscriptions — `/subscriptions` (R19, R20)

- **Header:** "Subscriptions" + **+ New Subscription** + **From template** button.
- **Status tabs with counts (R19, R20):** All · Draft · Quotation · Confirmed · Active · Paused · Closed · Expiring soon.
- **Filters:** customer, plan, start/expiry date range; search by number.
- **Table columns:** Number (e.g. SUB-0042) · Customer · Plan · Billing period · Start date · Expiry date · Next invoice date · Total · Status · Actions.
- **Row actions by status:**
  | Status | Actions |
  |---|---|
  | Draft | Edit, Send as Quotation, Delete |
  | Quotation | Edit, Confirm, Cancel (shows "valid until" date) |
  | Confirmed | Activate |
  | Active | Generate invoice, Pause*, Renew*, Close early* |
  | Paused | Resume, Close* |
  | Closed | View only |
  \* only shown if the plan allows it (R13, R21).
- Every state-changing action opens a confirm dialog.
- **APIs:** `GET /api/subscriptions?status=&page=`, `POST /api/subscriptions/{id}/{action}` where action ∈ `quote | confirm | activate | pause | resume | renew | close`.

### A6a. New / Edit Subscription — `/subscriptions/new`, `/subscriptions/:id/edit` (R15, R17, R18)

Full page (not a dialog — it has many fields).

- **Start from template (R15):** optional select at the top; choosing one fills plan, lines, payment terms and validity.
- **Header fields (R17):**
  - Number *(auto-generated by backend, shown read-only after save)*
  - Customer *(searchable select)*
  - Plan *(select — shows price, period, min qty)*
  - Start date · Expiry date
  - Payment terms
  - Quotation valid until *(from template validity)*
- **Order lines (R18):** editable table
  | Product | Variant | Quantity | Unit price | Taxes | Discount | Amount |
  - Quantity can't go below plan minimum (R11) — inline error.
  - Add-on products can be added/removed as lines (R14).
  - Unit price, taxes, discount and amount are **returned by the backend** preview endpoint as lines change.
- **Discount code** field → validated by API; applied discount appears as a line.
- **Totals panel:** Untaxed amount · Discount · Taxes · **Total** (from API).
- **Buttons:** Save as Draft · Save & Send Quotation · Cancel.
- **APIs:** `POST /api/subscriptions/preview`, `POST /api/subscriptions`, `PUT /api/subscriptions/{id}`, `POST /api/discounts/validate`.

### A6b. Subscription detail — `/subscriptions/:id` (R17–R21)

- **Header:** number, customer, large status badge, allowed action buttons.
- **Status stepper (R19):** Draft → Quotation → Confirmed → Active → Closed (current step in gradient; "Paused" shown as a side state).
- **Info cards:** customer, plan (with options badges), dates, payment terms, next invoice date.
- **Order lines table** with taxes and totals.
- **Invoices** generated from this subscription.
- **History timeline** (created, quoted, confirmed, invoiced, paused, renewed, closed — who and when).

---

### A7. Invoices — `/invoices` (R22, R25, R26, R35, R36)

- **Header:** "Invoices" + **Generate Due Invoices** button.
- **Generate Due Invoices dialog (R22, R26):**
  1. Calls `GET /api/invoices/due-preview` → list of subscriptions due today with amount each; already-invoiced ones shown as "Already invoiced — skipped".
  2. Admin reviews and clicks **Generate N invoices**.
  3. `POST /api/invoices/generate-due` → result: "N created, M skipped (already billed)".
- **Status tabs (R25, R35):** All · Draft · Confirmed · Paid · Cancelled — plus an **Overdue** quick filter (Confirmed + past due date) (R36).
- **Summary strip:** Total invoiced · Paid · Outstanding · Overdue (from API).
- **Filters:** customer, subscription, date range.
- **Table columns:** Invoice # · Customer · Subscription · Invoice date · Due date (red if past) · Total · Paid · Balance · Status · Actions.
- **Row actions:** View · Confirm (Draft) · Record payment (Confirmed) · Send · Print · Cancel.
- **APIs:** `GET /api/invoices?status=&overdue=&page=`, `POST /api/invoices/generate-due`.

### A7a. Invoice detail — `/invoices/:id` (R23, R24, R33, R34)

Looks like a real printable invoice.

- **Header:** company info, invoice number, invoice/due dates, status badge, source subscription link.
- **Bill to:** customer details.
- **Lines:** Product · Description · Qty · Unit price · Taxes · Amount.
- **Discount line (R33):** shown automatically if a discount applied (e.g. "SEATS10 −10%").
- **Totals:** Untaxed · Discount · Tax breakdown per tax rule (R23) · **Total** · Paid · **Balance due**.
- **Payments received** list.
- **Action buttons (R24):** Confirm · Cancel · **Send** (email to customer) · **Print** (print-friendly view / browser print to PDF) · Record Payment.
- **APIs:** `GET /api/invoices/{id}`, `POST /api/invoices/{id}/confirm | cancel | send`.

---

### A8. Payments — `/payments` (R34)

- **Header:** "Payments" + **+ Record Payment**.
- **Summary cards:** Collected this month · No. of payments · Top method · Outstanding.
- **Filters:** method, date range, customer.
- **Table columns:** Payment # · Date · Customer · Invoice # (link) · Amount · Method · Note.
- **Record Payment dialog (R34)** — also opened from Invoices / Invoice detail:
  - Invoice *(searchable, only unpaid/partially paid, shows balance)*
  - Amount *(defaults to balance)*
  - Payment date
  - Method *(Cash · Bank transfer · UPI · Card · Cheque)*
  - **Note**
  - After save → invoice refreshes; becomes **Paid** when balance reaches 0 (backend decides).
- **APIs:** `GET /api/payments`, `POST /api/payments`.

---

### A9. Discounts — `/discounts` (R27–R33)

- **Access:** create/edit/delete **admin only** (R27); staff see read-only.
- **Tabs:** Active · Scheduled · Expired / Used up.
- **View:** coupon-style cards (dashed border, big code, "10% OFF" / "₹500 OFF") or table.
- **Columns:** Name/Code · Type · Value · Min purchase / Min qty · Start–End · Usage (12 / 50) · Applies to · Status.
- **Create/Edit form:**
  - Name, Code
  - **Type (R28):** Percentage · Fixed amount
  - Value
  - **Minimum purchase amount** and/or **Minimum quantity (R29)**
  - **Start date · End date (R30)**
  - **Usage limit (R31)** *(blank = unlimited)*
  - **Applies to (R32):** Whole subscription · Specific products (multi-select)
- **Status (R33)** is set by the backend: Active, Scheduled, Expired (past end date), Used up (limit reached).
- **APIs:** `GET/POST/PUT/DELETE /api/discounts`, `POST /api/discounts/validate`.

---

### A10. Taxes — `/taxes` (R23) — admin only

- **Purpose:** Admin defines tax rules; the backend applies them automatically to subscription and invoice lines.
- **Table columns:** Name (e.g. GST 18%) · Type (Percentage / Fixed) · Rate · Applies to (all products / selected products / product types) · Default? · Status.
- **Create/Edit dialog:** Name, Type, Rate, Applies to, Set as default, Active.
- **APIs:** `GET/POST/PUT/DELETE /api/taxes`.

---

### A11. Reports — `/reports` (R37, R38)

The finance lead's "one place" page.

- **Global filters bar (R38):** date range · plan · product · customer · status — applies to every section.
- **Summary view (R38):** KPI cards — Active subscriptions · Revenue (invoiced) · Payments received · Outstanding · Overdue count & amount · MRR.
- **Sections (tabs):**
  - **Subscriptions** — count by status, new vs closed over time (chart) + table.
  - **Revenue** — revenue by month (chart), revenue by plan/product (bars) + table.
  - **Payments** — collected by method (donut), by day (chart) + table.
  - **Overdue** — list of overdue invoices with days overdue, amount, customer, "Send reminder" action.
- **Export:** CSV download of the current table *(if time permits)*.
- **APIs:** `GET /api/reports/summary?…filters`, `/api/reports/subscriptions`, `/api/reports/revenue`, `/api/reports/payments`, `/api/reports/overdue`.

---

### A12. AI Assistant — `/assistant` (X1, our differentiator)

- **Empty state:** AI orb + "How can I help with your subscriptions today?" + suggested prompt cards:
  - 📊 "What is our MRR?" · "Which plan earns the most?"
  - ⏰ "Which subscriptions expire this week?" · "Prepare renewal reminders"
  - 🧾 "Generate invoices due today" · "Show overdue invoices"
  - 👤 "Which customers owe us money?"
- **Chat:** user bubbles (right, gradient) · AI messages (left, surface card, markdown).
- **Every AI response can show:**
  1. **Tool steps** (`ToolExecutionStatus`) — e.g. `✓ get_expiring_subscriptions(days=7) — 12 results`.
  2. **Text answer.**
  3. **Result table** (`ResultTable`) — rows link to detail pages.
  4. **Mini chart** for revenue questions *(optional)*.
  5. **Approval card** (`ApprovalDialog`) when there is a `pending_action` — "Send renewal reminders to 12 customers" → Preview · Cancel · **Approve** (admin only). After approval → ✓ result or error.
- **Input:** textarea (Enter = send, Shift+Enter = newline), typing indicator, disabled while waiting.
- **APIs:** `POST /api/ai/chat { message, conversation_id }` → `{ reply, tool_calls[], data?, pending_action? }`; `POST /api/ai/approve { action_id }`.

---

### A13. Users & Staff — `/users` (R5, R7) — admin only

- **Table columns:** Name · Email · Role (Admin / Staff) · Status (Active / Disabled) · Last login · Actions.
- **+ Add Staff Member (R7):** Name, Email, Role, temporary password (must meet R3 rules) *or* "send invite link".
- **Actions:** Edit role, Disable/Enable.
- Customers are not managed here (they're in Customers).
- **APIs:** `GET/POST/PUT /api/users`.

### A14. Settings — `/settings`

- **Profile** (all roles): name, email, **change password** with the R3 rule checklist.
- **Business** (admin): company name, address, currency (₹ INR), invoice prefix (`INV-`), subscription prefix (`SUB-`), default payment terms.
- **Automation** (admin): toggles — auto-generate invoices daily, renewal reminder X days before expiry, auto-close expired subscriptions.
- **APIs:** `GET/PUT /api/settings`, `POST /api/auth/change-password`.

---

### C1. Portal Home — `/portal` (R6)

- **Layout:** `PortalLayout` — simpler top nav (Home · My Subscriptions · My Invoices · Profile · Logout), same theme.
- **Cards:** Active subscriptions · Next payment due (amount + date) · Outstanding balance.
- **Lists:** my active subscriptions (short), latest invoices (short).
- **API:** `GET /api/portal/summary`.

### C2. My Subscriptions — `/portal/subscriptions` (R6)

- Cards or table of **only this customer's** subscriptions: Number · Plan · Status · Start · Expiry · Next invoice · Amount.
- **API:** `GET /api/portal/subscriptions`.

### C2a. My Subscription detail — `/portal/subscriptions/:id` (R6, R21)

- Plan, lines, dates, status stepper, related invoices.
- **Self-service actions** ("manage their own subscriptions") — only if the plan allows it: **Renew**, **Pause**, **Request to close**. Each with a confirm dialog.
- **API:** `GET /api/portal/subscriptions/{id}`, `POST /api/portal/subscriptions/{id}/{renew|pause|close}`.

### C3. My Invoices — `/portal/invoices` (R6)

- Table: Invoice # · Date · Due date · Total · Balance · Status (Paid / Outstanding / Overdue).
- **API:** `GET /api/portal/invoices`.

### C3a. My Invoice detail — `/portal/invoices/:id`

- Same printable invoice view as A7a, read-only, with **Print / Download** button.
- **API:** `GET /api/portal/invoices/{id}`.

### C4. My Profile — `/portal/profile`

- Name, phone, company, billing address; **change password** (R3 rules).
- **API:** `GET/PUT /api/portal/profile`, `POST /api/auth/change-password`.

---

### O1. 404 Not Found / O2. 403 Access Denied

Simple themed pages with a button back to the user's home (`/` or `/portal`).

---

## 5. Shared components

| Component | Used on |
|---|---|
| `AdminLayout` (Sidebar + Header) | All A-pages |
| `PortalLayout` (top nav) | All C-pages |
| `ProtectedRoute` / `RoleGuard` | Router — checks login and role |
| `Sidebar` | Role-filtered menu, magenta gradient |
| `Header` | Search pill, notifications (overdue / expiring counts), user menu |
| `PageHeader` | Title, subtitle, primary action |
| `DataTable` | All lists — server-side pagination, search, filters, sorting, row actions |
| `StatusBadge` | Subscription, invoice, discount, payment statuses (one colour per status) |
| `StatCard` | Dashboard, Reports, Payments, Portal |
| `StatusStepper` | Subscription detail (admin + portal) |
| `LinesEditor` | Subscription form, Quotation templates |
| `TotalsPanel` | Subscription form/detail, Invoice detail |
| `InvoiceView` | Invoice detail (admin + portal) — print-friendly |
| `RecordPaymentDialog` | Invoices, Invoice detail, Payments |
| `PasswordRulesChecklist` | Sign Up, Reset Password, Settings, Portal Profile |
| `ConfirmDialog` | Every state-changing action |
| `EmptyState`, `ErrorState`, skeletons | Every page |
| `ChatWindow`, `ChatMessage`, `ToolExecutionStatus`, `ResultTable`, `ApprovalDialog`, `SuggestedPrompts` | AI Assistant |

**Status colours**

| Status | Colour |
|---|---|
| Draft | muted grey-violet |
| Quotation | violet |
| Confirmed | blue |
| Active / Paid | green (`success`) |
| Paused | orange (`accent`) |
| Overdue / Cancelled | red (`danger`) |
| Closed / Expired | grey |

---

## 6. Folder structure

```
frontend/src/
├── main.tsx, App.tsx, index.css (theme tokens)
├── layouts/        AdminLayout.tsx, PortalLayout.tsx, AuthLayout.tsx
├── routes/         ProtectedRoute.tsx, RoleGuard.tsx
├── pages/
│   ├── auth/       Login, Signup, ForgotPassword, ResetPassword
│   ├── admin/      Dashboard, Products, ProductDetail, Plans, QuotationTemplates,
│   │               Customers, CustomerDetail, Subscriptions, SubscriptionForm,
│   │               SubscriptionDetail, Invoices, InvoiceDetail, Payments, Discounts,
│   │               Taxes, Reports, AIAssistant, Users, Settings
│   ├── portal/     PortalHome, MySubscriptions, MySubscriptionDetail,
│   │               MyInvoices, MyInvoiceDetail, MyProfile
│   └── NotFound.tsx, Forbidden.tsx
├── components/     ui/ (shadcn), common/, dashboard/, subscriptions/, invoices/, ai/
├── services/       api.ts + one service per resource
├── hooks/          TanStack Query hooks (useSubscriptions, useInvoices, useAuth…)
├── types/          API types copied from docs/api-contracts.md
├── mocks/          mock data for every endpoint
└── lib/            formatCurrency (₹), formatDate, cn()
```

---

## 7. Build order

| Phase | Pages | Why first |
|---|---|---|
| 1 | Theme, AdminLayout, Login, Dashboard (mocks) | Look & feel; demo opens here |
| 2 | DataTable → Products (+ variants) → Plans → Customers | Simple CRUD, proves the pattern |
| 3 | Subscriptions list, form, detail | Core business flow |
| 4 | Invoices + detail, Payments, Discounts, Taxes | Billing loop |
| 5 | AI Assistant (mocks → real) | Our highlight |
| 6 | Sign Up, Forgot/Reset Password, Customer Portal | Required by brief (R1–R6) |
| 7 | Reports, Quotation Templates, Users & Staff, Settings | Complete the brief |
| 8 | 404/403, loading/empty/error polish, responsiveness | Final polish |

> **Must not be cut** (directly in the brief): Sign Up with password rules, roles + portal, product variants, plan options, subscription lines + statuses, invoice generation/confirm/cancel/send/print, discount rules, payments with note, Reports with filters.
> **Can be simplified if short on time:** Quotation Templates (simple form), Settings (Profile tab only), Reports (one page with summary + overdue table).

---

## 8. Demo script

1. **Sign up** as a new customer → password checklist ticks green.
2. Log in as **Admin** → Dashboard.
3. Create a **product** with a variant (Brand = Odoo, +₹560) and a **monthly plan** (pausable, renewable).
4. Create a **discount** (10% off, min qty 5, usage limit 50) and a **tax** (GST 18%).
5. Create a **subscription from a quotation template** → Draft → Quotation → Confirmed → Active.
6. **Generate due invoices** → preview shows nothing duplicated → invoice has discount + tax lines automatically.
7. **Confirm** and **print** the invoice → **record a payment** with a note → status becomes **Paid**.
8. **Reports** → filter by plan → summary updates.
9. **AI Assistant**: "Which subscriptions expire this week?" → table → "Prepare renewal reminders" → **Approve**.
10. Log in as the **customer** → portal shows only their subscription and the paid invoice.
