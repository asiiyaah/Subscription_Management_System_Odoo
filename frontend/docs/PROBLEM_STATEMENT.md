# Problem Statement — Subscription Management System (Odoo Hackathon)

> Source: `Subscription_Management_System-1.pdf` (official competition brief).
> This file is a faithful copy of the brief, followed by a checklist of every requirement it contains.
> The frontend page plan that covers these requirements is in [FRONTEND_PAGES.md](./FRONTEND_PAGES.md).

---

## Part A — The brief

**Subscription Management System**
*Build one system to run plans, subscriptions and recurring billing in one place.*

### 1) The Challenge

Your task is to build **one unified software platform** that runs the full life of a subscription business, from setting up products and plans to sending invoices, collecting payments and reporting revenue. Think of it as the **digital backbone** of a company that earns its money every month, not just once. Read the scenes that follow as things that actually happen in an ordinary billing month, and design the system that makes each of them easy.

### 2) Meet Brightloop Software

Brightloop Software sells everything on subscription: business software billed by the month or the year, add-ons customers switch on and off, and a few products that come in different variants. Customers range from small shops on a monthly plan to large companies on yearly contracts. **An admin sets up products, plans, taxes and discounts**, a small internal team handles customers day to day, and customers want to **see and manage their own subscriptions** without having to email anyone.

#### How Things Run Today

- **Customer subscriptions:** Tracked in a spreadsheet
- **Renewals:** Remembered by whoever notices first
- **Invoices:** Typed up by hand every month
- **Payments:** Matched to invoices by scrolling through bank statements
- **Revenue reports:** Built manually at the end of each quarter

**Renewals get missed, invoices go out wrong, and nobody can say how much recurring revenue the company actually has.**

### 3) A Month at Brightloop

The scenes below follow one billing month at Brightloop Software, from a new customer creating an account to the finance lead reviewing the numbers. **Every one of them is a problem someone at the company faces today.**

#### A new customer signs up

A small business finds Brightloop online and creates an account with their email and a password. **Each email can belong to only one account**, and the password must be **more than eight characters, with an uppercase letter, a lowercase letter and a special character**. If they forget it later, **a reset link should arrive at their registered email**.

Not everyone who logs in should see the same things. **The admin controls the whole system**, **internal staff handle day-to-day work with limited access**, and **customers see only their own subscriptions and invoices through a portal**. **Only the admin can add a new member of staff.**

#### Launching a new plan

Brightloop is launching a new product. The admin adds it with its **name, type, sales price, cost price and notes**, and offers it in variants, for example by brand, where **choosing the Odoo brand adds 560 to the price**.

Then comes the plan: what it costs and how often it bills (**daily, weekly, monthly or yearly**), **the minimum quantity, and the dates it is available**. Some plans should **close on their own when they end**, and others can be **closed early, paused or renewed**. The admin decides which, plan by plan.

#### Turning a quote into a subscription

A sales rep is preparing an offer for a large customer. Instead of building it from scratch, they start from a **quotation template** that already has the right plan and product lines, and **stays valid for a set number of days**.

Each subscription gets its own **number, a customer, a plan, a start date, an expiry date and payment terms**, with lines showing the **product, quantity, unit price, taxes and amount**. It moves from **Draft to Quotation to Confirmed to Active and finally to Closed**, and anyone on the team should be able to see where it stands.

#### Billing day

It is billing day, and hundreds of subscriptions are due at once. Nobody should be typing invoices by hand. Each one should be **created from its subscription**, with the **customer details, product lines, taxes and totals** already filled in.

**Taxes are calculated automatically** from rules the admin has set. The team can **confirm, cancel, send or print any invoice**, and each invoice moves from **Draft to Confirmed to Paid**. **Nothing should be billed twice or skipped.**

#### A customer asks for a better price

A customer wants a discount for taking more seats. **Only the admin can create discount rules**: **a fixed amount or a percentage**, with **a minimum purchase or quantity, start and end dates, and a limit on how many times it can be used**.

A discount can apply to **specific products or to whole subscriptions**. Once it applies, it should **appear on the next invoice on its own**, without anyone having to remember it, and **stop when it expires or runs out**.

#### The money comes in

Payments arrive by different methods and on different days. Each one needs to be recorded with its **method, amount, date and a note**, against the right invoice.

At any moment, the team should be able to see **which invoices are paid and which are still outstanding**, so overdue ones can be chased before they turn into lost revenue.

#### The finance lead, at the end of the month

How many subscriptions are active? How much revenue came in, and how much is still owed? Which invoices are overdue? Today, answering those questions takes days.

The finance lead wants one place to see **active subscriptions, revenue, payments and overdue invoices**, **with filters and a summary view**. With **thousands of subscriptions** on the books, every page should still respond in **under two seconds**.

---

## Part B — Requirement checklist

Every requirement in the brief, numbered so we can tick them off. The **Page** column says where the frontend covers it (see [FRONTEND_PAGES.md](./FRONTEND_PAGES.md)).

### Accounts & access

| ID | Requirement | Page |
|---|---|---|
| R1 | Sign up with email + password | Sign Up |
| R2 | Each email belongs to only one account (show "email already registered" error) | Sign Up |
| R3 | Password: **more than 8 characters**, at least 1 uppercase, 1 lowercase, 1 special character | Sign Up, Reset Password, Change Password |
| R4 | Forgot password → reset link sent to registered email | Forgot Password, Reset Password |
| R5 | Three roles: **Admin** (everything), **Internal staff** (limited), **Customer** (own data only via portal) | Role-based routing + sidebar |
| R6 | Customers see only their own subscriptions and invoices through a **portal** | Customer Portal pages |
| R7 | **Only Admin** can add a new staff member | Users & Staff |

### Products & plans

| ID | Requirement | Page |
|---|---|---|
| R8 | Product: **name, type, sales price, cost price, notes** | Products |
| R9 | Product **variants** with an extra price per attribute value (e.g. Brand = Odoo → +560) | Product detail / form |
| R10 | Plan: **price, billing period (daily / weekly / monthly / yearly)** | Plans |
| R11 | Plan: **minimum quantity** | Plans |
| R12 | Plan: **availability dates** (start / end) | Plans |
| R13 | Plan options, set per plan: **auto-close at end**, **closable early**, **pausable**, **renewable** | Plans |
| R14 | Add-ons customers switch on and off | Products (type = Add-on) + Subscription lines |

### Quotations & subscriptions

| ID | Requirement | Page |
|---|---|---|
| R15 | **Quotation templates** with preset plan + product lines | Quotation Templates |
| R16 | Template **validity in days** | Quotation Templates |
| R17 | Subscription: **number, customer, plan, start date, expiry date, payment terms** | Subscription form / detail |
| R18 | Subscription lines: **product, quantity, unit price, taxes, amount** | Subscription form / detail |
| R19 | Status flow **Draft → Quotation → Confirmed → Active → Closed** | Subscriptions + detail stepper |
| R20 | Whole team can see where each subscription stands | Subscriptions list (status tabs) |
| R21 | Pause / renew / close early — only when the plan allows it | Subscription actions |

### Billing & taxes

| ID | Requirement | Page |
|---|---|---|
| R22 | Invoices **generated from subscriptions** (customer, lines, taxes, totals prefilled) | Invoices → Generate Due Invoices |
| R23 | **Taxes calculated automatically** from admin-defined rules | Taxes (admin) + invoice totals |
| R24 | Invoice actions: **confirm, cancel, send, print** | Invoice detail |
| R25 | Invoice status **Draft → Confirmed → Paid** (+ Cancelled) | Invoices |
| R26 | **Nothing billed twice or skipped** (frontend shows preview + backend prevents duplicates) | Generate Due Invoices dialog |

### Discounts

| ID | Requirement | Page |
|---|---|---|
| R27 | **Only Admin** creates discount rules | Discounts (admin-only) |
| R28 | Type: **fixed amount or percentage** | Discounts |
| R29 | **Minimum purchase or minimum quantity** | Discounts |
| R30 | **Start and end dates** | Discounts |
| R31 | **Usage limit** | Discounts |
| R32 | Applies to **specific products** or **whole subscriptions** | Discounts |
| R33 | Auto-applied on next invoice; stops when expired or used up | Invoice detail (discount line shown), Discounts (usage/status) |

### Payments

| ID | Requirement | Page |
|---|---|---|
| R34 | Record payment with **method, amount, date, note** against an invoice | Record Payment dialog, Payments |
| R35 | See **paid vs outstanding** invoices at any moment | Invoices (status tabs + balance column) |
| R36 | Spot **overdue** invoices to chase them | Invoices (Overdue filter), Dashboard |

### Reporting & performance

| ID | Requirement | Page |
|---|---|---|
| R37 | One place for **active subscriptions, revenue, payments, overdue invoices** | Dashboard, Reports |
| R38 | **Filters** and a **summary view** | Reports |
| R39 | Every page responds in **under 2 seconds** with thousands of records | All list pages: server-side pagination, filtering, search; skeleton loaders |

### Our extra (not in the brief — our differentiator)

| ID | Feature | Page |
|---|---|---|
| X1 | AI Subscription Assistant: natural-language questions, tool calling, admin approval for actions | AI Assistant |
