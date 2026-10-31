# SubscriptIQ Frontend — Manual Testing Guide (Steps 2–6)

How to check Invoices, Payments, Discounts & Taxes, the AI Assistant and Reports by hand.
Each section has **flows** (a realistic story to walk through) and **checks** (tick them off).
Requirement IDs (R22, R34 …) refer to [PROBLEM_STATEMENT.md](./PROBLEM_STATEMENT.md).

---

## 0. Before you start

```bash
cd frontend
npm install          # first time only
cp .env.example .env # first time only — keeps VITE_USE_MOCKS=true
npm run dev          # open http://localhost:5173
```

**Log in** with the demo buttons on the login page:

| Role | Use it to test |
|---|---|
| **Admin** | Everything (default for this guide) |
| **Staff** | Read-only discounts, no Taxes page, can't approve AI actions |

**Things to know about the mock data**

- It lives in the browser's memory and **resets when you reload the page**. Changes survive moving between pages,
  but not F5. If you get stuck, reload to start fresh.
- Dates are relative to *today*, so which invoices are overdue depends on the day you test.
- Links to Subscriptions / Customers open **placeholder** pages until Member 1 builds them — that's expected.
- Useful records:

| Record | Why it's useful |
|---|---|
| Discount `SEATS10` | 10%, min 5 seats, used 23 / 100 — appears on some invoices |
| Discount `EARLYBIRD` | Used 50 / 50 → **Used up** |
| Discount `DIWALI25` | Starts in 7 days → **Scheduled**, never used (can delete) |
| Discount `SUPPORT50` | Ended 15 days ago → **Expired** |
| Discount `PARTNER15` | Switched off → **Inactive** |
| Tax `GST 18%` | The **default** tax |
| Tax `GST 5%` | **Inactive** tax |

**Phone-width testing:** browser DevTools → device toolbar → width **400 px**.

---

## Step 2 — Invoices (`/invoices`)

### Flow A: Billing day (R22, R26)
1. Open **Invoices** → click **Generate due invoices**.
2. Read the preview: some rows **Ready**, others **Skipped — Already invoiced for this period**, plus an estimated total.
3. Click **Generate N invoices** → success screen "N draft invoices created".
4. Click **View draft invoices** → list switches to the **Draft** tab and shows the new invoices.
5. Open **Generate due invoices** again → every row is now **Skipped** and the button says **Nothing to generate**.
   ✅ This proves nothing is billed twice.

### Flow B: Draft → Confirmed → Paid (R24, R25, R34)
1. On the **Draft** tab, open a row's **⋯** menu → **Confirm** → confirm the dialog.
2. The invoice moves to **Confirmed**; tab counts update.
3. Open the invoice (click the row) → **Record payment** → pay **half** the balance.
4. Badge becomes **Partially paid** (or stays **Overdue** if past due); balance card and progress bar update.
5. **Record payment** again → click **Pay full balance** → save → badge becomes **Paid**, balance ₹0.00.

### Checks — list page
- [ ] Four summary cards show ₹ amounts; clicking **Overdue** switches to the Overdue tab.
- [ ] Tabs (All, Draft, Confirmed, Overdue, Paid, Cancelled) show counts that match the rows.
- [ ] Overdue rows: red due date with "Overdue · N days ago".
- [ ] Search `acme` → only Acme Retail; search `zzz` → "No results match" + **Clear filters** works.
- [ ] Sort by **Total** (and reverse); go to page 2; change rows per page to 25.
- [ ] Refresh the page (F5) → tab/search/page are kept *(data itself resets)*.

### Checks — row ⋯ menu shows only allowed actions
| Status | Menu should show |
|---|---|
| Draft | View, Confirm, Cancel invoice |
| Confirmed (unpaid) | View, Record payment, Send to customer, Print, Cancel invoice |
| Confirmed (part-paid) | View, Record payment, Send, Print — **no Cancel** |
| Paid | View, Send to customer, Print |
| Cancelled | View, Print |

- [ ] **Send to customer** → toast "Invoice sent to …@…".
- [ ] **Cancel invoice** → confirm → row becomes Cancelled, balance shows "—".
- [ ] **Print** from the menu → invoice page opens and the print dialog appears.

### Checks — Record payment dialog
- [ ] Amount is pre-filled with the balance.
- [ ] Amount above the balance → error; empty / 0 → error.
- [ ] Payment date in the future → error.
- [ ] Note is optional and shows later on the invoice and in Payments.

### Checks — invoice detail page (`/invoices/:id`)
- [ ] Header: seller block left, "TAX INVOICE / number / status" right (draft says "DRAFT INVOICE").
- [ ] **Bill to** on the left; **2 × 3 grid** on the right: Invoice date · Due date / Billing period · Payment terms /
      Subscription · Plan — rows line up, no big empty gaps.
- [ ] Overdue invoice: red due date with "Overdue · N days ago" on its own line.
- [ ] Line table dividers are the same width as the dividers above and below it.
- [ ] Totals: Subtotal − Discount (if any, green, with code on a second line) + CGST + SGST = **Total**;
      **Balance due** label lines up with "Subtotal"; amounts line up digit by digit.
- [ ] **Payment information** block (UPI, bank, account, IFSC) sits left of the totals.
- [ ] Buttons change with status (Draft: Confirm + Cancel · Confirmed: Record payment, Send, Print, Cancel · Paid: Send, Print).
- [ ] Right column: balance card with progress bar; **Payments received** list with PAY-number, method, note.
- [ ] **Print** → preview is white with black text, no sidebar/header/buttons.
- [ ] `/invoices/9999` → "Invoice not found".

### Phone (400 px)
- [ ] Summary cards 2 per row; tabs scroll sideways; table scrolls inside its box (page doesn't scroll sideways).
- [ ] Detail: grid stacks under Bill to; totals appear **above** payment information; line table scrolls in its box.

---

## Step 3 — Payments (`/payments`)

### Flow C: Recording a payment from the Payments page (R34)
1. Open **Payments** → **Record payment**.
2. The dialog lists **unpaid** invoices (overdue ones in red), search box focused, **Save payment** disabled.
3. Search an invoice number or customer → list narrows → pick one.
4. The payment form opens with that invoice's balance; **Change invoice** goes back to the list.
5. Save a partial amount with method UPI and a note.
6. New **PAY-xxxx** row appears at the top; cards and **By method** update.
7. Open **Invoices** → that invoice's balance has dropped.

### Checks
- [ ] Four cards: Collected this month, Payments this month, Top method, Still outstanding.
- [ ] **Top method** matches the top bar in **By method**.
- [ ] **Still outstanding** card → opens Invoices on the Confirmed tab.
- [ ] Newest payments first; sort by **Amount** and **Date**.
- [ ] Search `acme` → Acme only; search `UTR` → payments with UTR notes.
- [ ] **Method** filter = UPI → only UPI badges.
- [ ] **This month** fills both dates and filters.
- [ ] From date later than To date → red warning + "No results match".
- [ ] Invoice number in a row links to that invoice; clicking the row does too.
- [ ] Pay an invoice's full balance → it disappears from the picker and is **Paid** in Invoices.
- [ ] Payment recorded from the Invoices page appears here immediately.
- [ ] Phone: cards 2 per row, filters wrap, **By method** moves below the table.

---

## Step 4 — Discounts (`/discounts`) & Taxes (`/taxes`)

### Flow D: Admin creates a volume discount (R27–R32)
1. **Discounts** → **New discount**.
2. Code `save 20` → becomes `SAVE20`. Name "20% off 10+ seats". Type **Percentage**, value 20 → hint shows "20% off".
3. Minimum quantity 10. Start today, end in 30 days, usage limit 100.
4. Applies to **Specific products** → tick *Project Management Suite*.
5. Check the summary line at the bottom → **Create discount** → toast + new row with status **Active**.

### Flow E: Retiring a discount (R33)
1. On `SEATS10` (already used) open **⋯** → there's **no Delete**, only **Deactivate**.
2. **Deactivate** → confirm → it moves to the **Inactive** tab.
3. **⋯ → Activate** → back to Active.
4. On `DIWALI25` (never used) **⋯ → Delete** → confirm → row disappears.

### Checks — Discounts
- [ ] Every tab (All, Active, Scheduled, Expired, Used up, Inactive) has at least one row; counts match.
- [ ] `EARLYBIRD` usage bar full and grey; `DIWALI25` "Starts in 7 days"; `CRM20` "Ends in 5 days".
- [ ] Empty form submit → errors on code, name, value.
- [ ] Code `ab` → format error. Percentage `150` → error. End date before start → error.
- [ ] Specific products with none ticked → error.
- [ ] Creating `SEATS10` again → "already used" error under Code.
- [ ] Edit `SEATS10` → usage limit 10 (below 23 used) → error.
- [ ] **Generate** fills a random 6-character code.

### Flow F: Admin changes the default tax (R23)
1. **Taxes** (admin sidebar) → `GST 18%` card first, **Default** badge, glowing border.
2. On `GST 12%` **⋯ → Make default** → it becomes the default; GST 18% loses the badge.
3. Make `GST 18%` the default again.

### Checks — Taxes
- [ ] Info banner explains default vs product-specific rules.
- [ ] Default card's menu has only **Edit**; in its form the **Default** switch is locked.
- [ ] Inactive `GST 5%` looks faded and has no **Make default** until activated.
- [ ] New rule named "GST 18%" → duplicate-name error.
- [ ] New rule with **Default** on → **Active** turns on and locks.
- [ ] Percentage 150 → error; Specific products with none ticked → error.
- [ ] Delete a non-default rule → confirm → card disappears.

### Checks — as Staff (log out → Staff)
- [ ] Discounts: info banner "Only an admin can create or change them", no **New discount**, no ⋯ menu, rows not clickable.
- [ ] **Taxes** not in the sidebar; opening `/taxes` redirects to the dashboard.

### Phone
- [ ] Discount form fields stack to one column; tax cards one per row.

---

## Step 5 — AI Assistant (`/assistant`)

### Flow G: Ask, look, act (the demo flow)
1. Open **AI Assistant** → glowing icon, heading and 4 groups of suggested questions.
2. Click **Which subscriptions expire this week?**
   - Your question appears on the right; a "Checking your data…" bubble shows.
   - Answer shows **Used 1 tool** with `get_expiring_subscriptions(days=7) — N found` (steps fade in).
   - Text answer with **bold** numbers, then a **table**; first column links to the subscription.
   - Follow-up chips appear under the latest answer.
3. Click the chip **Prepare renewal reminders for them**.
   - **Used 2 tools**, then an amber **Needs your approval** card listing each email.
4. Click **Approve & send** → spinner → green "N renewal reminders sent".

### Flow H: Billing through the assistant (R22, R26)
1. Ask **Generate invoices for subscriptions due today**.
2. Approval card lists each subscription with its amount → **Approve & create** → "N draft invoices created".
3. Open **Invoices → Draft** → the new drafts are there.
4. Back in the assistant, ask the same question again → "Every subscription due today is **already invoiced**" — no card.
   *(If you already ran Flow A in this session, step 1 will say this straight away — that's correct.)*

### Checks — answers
| Ask | Expect |
|---|---|
| What is our MRR? | `get_revenue_summary`, 4 metric cards (MRR, Active subscriptions, Collected, Outstanding) |
| Which plan generates the most revenue? | `get_revenue_by_plan`, bar chart, top plan named in text |
| Show overdue invoices | `get_overdue_invoices`, table; invoice numbers open the invoice |
| Which customers owe us the most? | `get_outstanding_by_customer`, table sorted by total owed |
| Show expiring in the next 30 days | `days=30` in the tool step, more rows than the 7-day answer |
| hello | Help message with bullet list of examples, no tools |

- [ ] Tables with more than 6 rows show **Show all N rows** / **Show fewer**.
- [ ] **Used N tools** collapses and expands.
- [ ] Hovering an answer shows a copy icon → toast "Answer copied".
- [ ] Approval **Cancel** → grey "Cancelled — nothing was sent or created."; buttons disappear.
- [ ] Enter sends; Shift+Enter adds a new line; box grows up to ~5 lines; send button disabled when empty or while waiting.
- [ ] Typing past 400 characters shows a counter; it stops at 500.
- [ ] Newest message scrolls into view.
- [ ] **New chat** → confirm → back to the suggestions screen.
- [ ] Go to Invoices and back → the conversation is still there.
- [ ] Open `/assistant?q=What is our MRR?` → it asks immediately; the `?q=` disappears from the address bar.

### Checks — as Staff
- [ ] Staff can ask questions and see answers.
- [ ] Approval card shows "Only an admin can approve this." and the approve button is disabled.

### Known mock behaviour
- After a **page reload**, approving an old card fails with "This action has expired…" (the mock forgets prepared
  actions). The real backend stores them; ask again to get a fresh card.

### Phone
- [ ] Chat fills the screen; input stays at the bottom; tables inside answers scroll sideways in their box.

---

## Step 6 — Reports (`/reports`)

The finance lead's "one place" page (R37) with filters and a summary view (R38).

### Flow I: Month-end review
1. Open **Reports** → default period **Last 3 months**; the date range shows at the right of the filter bar.
2. Read the six summary cards: Active subscriptions, MRR (today), Invoiced in period, Collected in period,
   Outstanding (today), Overdue (count + amount).
3. **Revenue** tab: "Invoiced vs collected" monthly bars (pink = invoiced, blue = collected, legend at top right),
   "Invoiced by plan" ranked bars, and a **Monthly breakdown** table with a collection %.
4. Hover a month's bars → tooltip with both amounts.
5. Click the **Overdue** summary card → jumps to the **Overdue** tab: aging buckets + oldest-first overdue table.
6. Click an invoice number → opens that invoice.

### Flow J: Drill into one plan and one customer
1. Set **Plan** = *Pro Monthly* → every card, chart and table updates (charts dim briefly while loading).
2. Set **Customer** = *Acme Retail* → numbers narrow further (some sections may become empty — that's expected).
3. Click **Reset** → back to all plans, all customers, last 3 months (the tab you're on stays).

### Flow K: Custom range + export
1. **Period** → *Custom range* → From/To boxes appear, pre-filled with the range you were looking at.
2. Pick a From date **after** the To date → red message "The From date is after the To date…", no report.
3. Fix the range → report returns.
4. On the **Payments** tab click **Export Payments CSV** → a `payments_<from>_<to>.csv` file downloads.
   Open it in Excel / Google Sheets: headers + one row per payment, ₹ amounts as plain numbers.

### Checks
- [ ] Refresh the page (F5) → period, plan, customer and tab are kept (they're in the URL).
- [ ] **This month** shows fewer months on the bar chart than **Last 6 months**; months with no activity show as zero (no gaps).
- [ ] **Subscriptions** tab: status bars in order Draft → Quotation → Confirmed → Active → Paused → Closed with status
      badges; "MRR by plan"; subscriptions table (subscription numbers link to the placeholder page).
- [ ] **Payments** tab: monthly received bars (pink only — single series, no legend), "By method" bars, payments table.
- [ ] Payments totals here match the **Payments** page for the same dates (use **This month** on both).
- [ ] Record a payment on the Invoices page, come back to Reports → Collected and Outstanding update.
- [ ] Tables over 10 rows show **Show all N rows** / **Show fewer**.
- [ ] Each tab's export button names that tab ("Export Revenue CSV", "Export Overdue CSV"…) and downloads that table.
- [ ] Staff can open Reports too (same view as admin).

### Phone (400 px)
- [ ] Filters wrap onto several lines; summary cards 2 per row; charts stack full width and stay readable;
      tables scroll inside their boxes.

---

## 7. End-to-end flows (run these before the demo)

### E2E 1 — "Billing day to cash" (Steps 2 + 3)
1. Invoices → **Generate due invoices** → generate.
2. Draft tab → **Confirm** one new invoice.
3. Open it → **Send** → toast.
4. Payments → **Record payment** → pick that invoice → pay in full with a note.
5. Back to the invoice → **Paid**, payment listed with its PAY-number and note.
6. Invoices summary cards: **Paid** went up, **Outstanding** went down.

### E2E 2 — "Collections" (Steps 2 + 3 + 5)
1. AI: **Show overdue invoices** → note the oldest one.
2. Click it in the AI table → invoice page → **Record payment** in full.
3. AI: ask **Show overdue invoices** again → that invoice is gone, total lower.

### E2E 3 — "Pricing rules" (Step 4)
1. Discounts → create `SAVE20` (Flow D) → Active tab shows it.
2. Deactivate it → Inactive tab.
3. Taxes → Make `GST 12%` default → then set `GST 18%` back.

### E2E 4 — "Month-end numbers" (Steps 3 + 6)
1. Reports → **This month** → note **Collected in period**.
2. Payments → **This month** → the "Collected this month" card shows the same amount.
3. Record a payment → back to Reports → Collected has gone up by that amount, Outstanding down.

### E2E 5 — "Permissions" (all steps)
1. As **Staff**: Discounts read-only, no Taxes, AI approve disabled, Invoices, Payments & Reports fully usable.
2. As **Customer**: lands on `/portal` placeholder; opening `/invoices` redirects back to `/portal`.

---

## 8. Reporting a problem

Copy this into the team chat:

```
Page / URL:
Logged in as: Admin / Staff
Steps:
1.
2.
Expected:
Actual:
Screenshot:
Screen width:
```
