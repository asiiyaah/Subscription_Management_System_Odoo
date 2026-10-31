# SubscriptIQ

> **AI-Powered Subscription Management & Recurring Revenue Operations Platform**  
> *Built for the Odoo Hackathon Challenge (Brightloop Software Case Study)*

---

## 👥 Team Members

| # | Name | Role | Responsibilities | Contact / GitHub |
|---|------|------|------------------|------------------|
| **1** | `[Team Member 1 Name]` | **Frontend Lead & Core Management** | Core dashboard, customer directories, product catalogs & variants, plan configuration, subscription lifecycle forms/views, customer portal subscription views, and design system charts. | `[GitHub / Email Placeholder]` |
| **2** | `[Team Member 2 Name]` | **Full-Stack / Financial Ops, Intelligence & UI Shell** | Authentication flow, app layout shell, invoice generation & lifecycles, payment recording, tax rules, discount engines, AI chat interface, financial reporting, and customer portal billing. | `[GitHub / Email Placeholder]` |
| **3** | `[Team Member 3 Name]` | **Backend Lead, Database Architect & AI/Automation** | FastAPI application architecture, Neon PostgreSQL schemas (28 tables), Alembic migrations, deterministic pricing/billing engines, APScheduler background jobs, and AI tool orchestrator with human approval gates. | `[GitHub / Email Placeholder]` |

---

## 📖 Table of Contents

- [Overview & The Brightloop Challenge](#-overview--the-brightloop-challenge)
- [Key Features & Requirement Matrix](#-key-features--requirement-matrix)
- [System Architecture](#-system-architecture)
- [Technology Stack](#-technology-stack)
- [Database & Data Models](#-database--data-models)
- [AI Copilot & Human-in-the-Loop Automation](#-ai-copilot--human-in-the-loop-automation)
- [Backend API Endpoints (80 Paths)](#-backend-api-endpoints-80-paths)
- [Project Directory Structure](#-project-directory-structure)
- [Prerequisites & Environment Variables](#-prerequisites--environment-variables)
- [Getting Started & Installation](#-getting-started--installation)
- [Demo Accounts & User Personas](#-demo-accounts--user-personas)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [UI & Design System](#-ui--design-system)
- [License](#-license)

---

## 🚀 Overview & The Brightloop Challenge

Modern subscription-based businesses struggle with fragmented operational silos: customer contracts tracked in desktop spreadsheets, recurring renewals remembered informally, invoices typed manually every month, payments reconciled by searching bank statements line-by-line, and quarterly revenue reports taking weeks to compile.

**SubscriptIQ** resolves these challenges by serving as a **single, unified revenue operations platform**:
1. **Catalog & Contract Flexibility:** Supports multi-period plans (daily, weekly, monthly, yearly), product variants with attribute surcharges (e.g., Odoo Brand `+₹560`), and add-ons.
2. **Deterministic Financial Accuracy:** All pricing, multi-tier tax computations, discount applications, and balances are calculated strictly on the backend using high-precision decimals—never trusting client-side calculations.
3. **Zero-Duplicate Idempotent Billing:** Automated batch invoice creation eliminates skipped or duplicate billings via unique subscription-period constraints.
4. **Transparent Customer Portal:** Dedicated, secure self-service portal for clients to review subscriptions, inspect tax invoices, and track payments without contacting support.
5. **AI Revenue Assistant with Human-in-the-Loop Approvals:** Natural-language querying for instant operational metrics (MRR, churn risk, expiring plans) and queued administrative approvals for consequential actions.

---

## 🎯 Key Features & Requirement Matrix

SubscriptIQ directly fulfills all 39 competition requirements (**R1–R39**) and introduces an AI copilot (**X1**):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             SubscriptIQ Platform                            │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│ Core Operations     │ Financial Engine    │ Intelligence & Self-Service    │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ • Products & Catalog│ • Tax Rules (GST)   │ • AI Revenue Assistant          │
│ • Attribute Variants│ • Discount Engine   │ • Human Approval Engine         │
│ • Flexible Plans    │ • Due Invoicing     │ • Customer Self-Service Portal  │
│ • Quote Templates   │ • Payment Recording │ • Real-Time Analytics & Reports │
│ • State Machine     │ • Overdue Tracking  │ • Role-Based Access Control     │
└─────────────────────┴─────────────────────┴─────────────────────────────────┘
```

### 1. Accounts & Role-Based Access Control (R1–R7)
- **Multi-Role RBAC:** Dedicated permissions for `admin` (full system control), `staff` (operational read/write, restricted settings), and `customer` (isolated self-service portal).
- **Secure Password Policy:** Enforces strict password complexity (>8 characters, uppercase, lowercase, special character) hashed using **Argon2**.
- **Admin-Only Staff Provisioning:** Only administrators can onboard staff members with custom access credentials.
- **Privacy & Security:** Non-enumerating password reset flows, secure JWT sessions, and database-level customer scoping.

### 2. Products, Variants & Tiered Plans (R8–R14)
- **Rich Catalog:** Manage recurring software products, physical goods, services, and modular add-ons with cost, sales price, and internal notes.
- **Dynamic Attribute Variants:** Configure variant attributes with custom price surcharges (e.g., Brand attribute with "Odoo" adding `+₹560`).
- **Flexible Billing Cadence:** Daily, weekly, monthly, and yearly intervals with minimum commitment quantities and validity date windows.
- **Configurable Plan Rules:** Per-plan policies governing auto-close upon expiry, early termination, pausing, and manual/automatic renewals.

### 3. Quotations & Subscription Lifecycles (R15–R21)
- **Quotation Templates:** Predefined reusable sales templates with preset plan lines, add-ons, and configurable validity periods (in days).
- **Deterministic State Machine:** Full subscription lifecycle tracking:
  $$\text{Draft} \longrightarrow \text{Quotation} \longrightarrow \text{Confirmed} \longrightarrow \text{Active} \longrightarrow \text{Closed} \quad (\text{or } \text{Paused})$$
- **Order Lines & Real-Time Preview:** Granular lines detailing product, quantity, unit price, applied taxes, discounts, and line totals computed on the server.
- **Full Operational Audit Trail:** History logs capturing every state change, pause, renewal, and resume event.

### 4. Automated Billing, Taxes & Invoicing (R22–R26)
- **Idempotent Recurring Billing:** Automated batch invoice generation from active subscriptions. A unique composite index `(subscription_id, billing_period_start, billing_period_end)` prevents duplicate billing.
- **Automated Tax Engine:** Support for percentage and fixed tax rules (e.g., CGST + SGST), default fallback taxes, and product-specific tax overrides.
- **Complete Invoice Lifecycle:** `Draft` $\rightarrow$ `Confirmed` $\rightarrow$ `Paid` (or `Cancelled`).
- **Distribution & Printing:** One-click invoice dispatch via email and formatted printable tax invoices with seller details, bank info, and QR-ready UPI identifiers.

### 5. Promotional Discounts & Coupons (R27–R33)
- **Admin-Controlled Discount Engine:** Configurable fixed-amount or percentage discounts with start/end validity dates and maximum usage limits.
- **Conditional Qualification:** Minimum subtotal purchase amounts or minimum seat/quantity requirements.
- **Targeted Scope:** Rules apply either to whole subscriptions or specific qualifying product lines.
- **Automatic Depletion & Expiry:** Discounts automatically appear on qualifying billing runs and immediately stop applying once expired or reaching usage quotas.

### 6. Payments & Accounts Receivable (R34–R36)
- **Multi-Method Tracking:** Record payments against invoices via Cash, Bank Transfer (NEFT/RTGS/IMPS), UPI, Credit/Debit Card, or Cheque.
- **Balance & Overpayment Protection:** Real-time balance calculations prevent overpayments; automatically marks invoices as `Partially Paid` or `Paid`.
- **Overdue Tracking & Aging:** Instant visibility into outstanding balances and overdue invoices categorized into payment delay buckets (0-15, 16-30, 31-60, 60+ days).

### 7. Executive Dashboard & Financial Analytics (R37–R39)
- **High-Performance Architecture:** All summary endpoints, aggregations, and list views execute in **under 2 seconds** with database indexing and server-side pagination.
- **Key Financial Metrics:** Real-time visibility into Monthly Recurring Revenue (MRR), Active Subscriptions, Total Collected Revenue, Outstanding Receivables, and Overdue Alerts.
- **Interactive Visualizations:** Monthly revenue bar charts, plan distribution breakdowns, and average days to payment using Recharts.
- **Exporting:** One-click CSV exports for subscriptions, payments, revenue streams, and overdue aging summaries.

### 8. AI Revenue Operations Assistant (X1 - Hackathon Differentiator)
- **Natural Language Assistant:** Ask questions like *"What is our current MRR?"*, *"Show me all subscriptions expiring this week"*, or *"Which customers have overdue invoices?"*.
- **Safe Allowlisted Tool Calling:** Powered by Gemini (with OpenAI fallbacks), the orchestrator executes safe ORM queries via structured Pydantic schemas—**zero raw SQL execution from LLMs**.
- **Human-in-the-Loop Approval Gate:** Sensitive operations (such as drafting batch invoices or dispatching overdue reminder emails) are queued as pending actions requiring one-click administrator approval.

---

## 🏗 System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend (React 19 + TypeScript + Vite)"]
        UI["Dark Plum UI / Tailwind CSS"]
        Router["React Router v7 (RBAC Navigation)"]
        TanStack["TanStack Query v5 + Axios Client"]
        Charts["Recharts Visualizations"]
    end

    subgraph API_Gateway["FastAPI Gateway (Uvicorn)"]
        Auth["JWT Auth & Security (Argon2)"]
        Routers["17 Modular Routers (80 REST Endpoints)"]
        Pydantic["Pydantic v2 Request/Response Validation"]
    end

    subgraph Core_Services["Deterministic Business Services"]
        Pricing["Pricing & Tax Calculation Engine"]
        Billing["Idempotent Billing & Invoice Service"]
        Lifecycle["Subscription State Machine"]
        PaymentService["Payment & AR Balance Service"]
    end

    subgraph Intelligence["AI & Automation Layer"]
        Orchestrator["AI Tool Orchestrator & Tool Registry"]
        LLM["Google Gemini 2.5 Flash / OpenAI"]
        Approvals["Human-in-the-Loop Approval Queue"]
        Scheduler["APScheduler (Billing & Expiry Automation)"]
    end

    subgraph Storage["Neon Serverless PostgreSQL"]
        DB[(PostgreSQL 16 Engine / 28 Relational Tables)]
    end

    Client -->|REST API Requests / Bearer JWT| API_Gateway
    API_Gateway --> Core_Services
    API_Gateway --> Intelligence
    Core_Services --> Storage
    Intelligence -->|Allowlisted ORM Tools| Storage
    Intelligence --> LLM
    Approvals --> Core_Services
    Scheduler --> Core_Services
```

---

## 💻 Technology Stack

### Frontend Architecture
- **Framework:** React 19 with TypeScript
- **Bundler & Build Tool:** Vite 8
- **Styling & Theming:** Tailwind CSS v4, custom theme tokens (Dark Plum `#1a0a2e`, Magenta `#e0218a`, Hot Pink `#ff2e93`, Orange `#ff8a3d`)
- **State Management & Caching:** TanStack React Query v5
- **Routing & RBAC:** React Router DOM v7
- **Data Visualization:** Recharts 3 (color-blind accessible palettes)
- **Icons & Components:** Lucide React, Headless UI / custom accessible primitives

### Backend Architecture
- **Language & Runtime:** Python 3.11+
- **API Framework:** FastAPI (high-performance asynchronous ASGI)
- **Server:** Uvicorn (standard ASGI worker)
- **Data Modeling & ORM:** SQLAlchemy 2.0 (declarative relational mappings)
- **Data Validation:** Pydantic v2 and Pydantic-Settings
- **Authentication:** PyJWT (HS256) and `pwdlib[argon2]` for password hashing
- **Database Driver:** `psycopg[binary]` (PostgreSQL adapter)
- **Database Migrations:** Alembic (environment revision: `9f4ac18e2d71`)

### AI & Automation
- **AI Engine:** Google Gemini API (`google-genai` SDK) with Gemini 2.5 Flash
- **Fallback Models:** OpenAI GPT-4o-mini compatibility via structured client
- **Tool Protocol:** Allowlisted function-calling orchestrator with schema validation
- **Scheduler:** APScheduler (BackgroundScheduler for automated due billing and auto-close lifecycle jobs)

### Database Infrastructure
- **Provider:** Neon Serverless PostgreSQL with SSL pooling
- **Reliability:** Strict foreign keys, composite unique indices, transaction rollbacks on test suites

---

## 🗄 Database & Data Models

The Neon database schema consists of **28 synchronized relational tables** managed through Alembic. Run `python scripts/check_schema.py` to verify schema integrity.

```
                    ┌────────────────────────┐
                    │         users          │
                    └───────────┬────────────┘
                                │ 1:1
                    ┌───────────▼────────────┐
                    │       customers        │
                    └─────┬────────────┬─────┘
                          │            │
             1:N          │            │          1:N
     ┌────────────────────┘            └────────────────────┐
     ▼                                                      ▼
┌───────────────┐     1:N      ┌───────────────┐     1:N    ┌───────────────┐
│ subscriptions ├─────────────►│   invoices    ├───────────►│   payments    │
└───────┬───────┘              └───────┬───────┘            └───────────────┘
        │ 1:N                          │ 1:N
        ▼                              ▼
┌──────────────────┐           ┌──────────────────┐
│subscription_lines│           │  invoice_lines   │
└───────┬──────────┘           └──────────────────┘
        │ N:1
        ▼
┌───────────────┐     N:1      ┌───────────────┐
│     plans     ├─────────────►│   products    │
└───────────────┘              └───────┬───────┘
                                       │ 1:N
                               ┌───────┴───────┐
                               ▼               ▼
                        ┌─────────────┐ ┌─────────────┐
                        │ product_attr│ │ product_tax │
                        └─────────────┘ └─────────────┘
```

### Key Entities
| Entity | Description | Key Constraints & Characteristics |
|---|---|---|
| `users` | System accounts (`admin`, `staff`, `customer`). | Unique email, Argon2 password hash, token version tracking. |
| `customers` | Client organizations and commercial records. | Linked user reference, billing addresses, tax identifiers. |
| `products` | Base billable items, software seats, add-ons. | Sales/cost prices, recurring classification, active status. |
| `product_attributes` / `values` | Dynamic product options (e.g., Brand). | Attribute name, value label, additional price surcharge. |
| `plans` | Subscription billing definitions. | Daily/weekly/monthly/yearly frequency, min qty, auto-close flag. |
| `quotation_templates` | Prebuilt sales quote blueprints. | Validity duration (days), preset template line items. |
| `subscriptions` & `lines` | Customer recurring contracts. | Status machine, start/end dates, precomputed billing amounts. |
| `invoices` & `lines` | Official tax invoices. | Sequential numbering, unique billing period constraint, tax breakdown. |
| `payments` | Monetary transactions against invoices. | Method (cash/bank/UPI/card/cheque), amount, date, reference. |
| `taxes` & `product_tax_rules` | Tax computation rules. | Percentage/fixed, default tax safeguard, product-specific overrides. |
| `discounts` & `product_rules` | Promotional discounting engine. | Percentage/fixed, minimum order subtotal/quantity, usage counters. |
| `ai_action_approvals` | Human-in-the-loop AI operations queue. | Serialized tool action, target entities, approval status (`pending`/`approved`/`rejected`). |
| `business_settings` | Organization configuration. | GSTIN, IFSC, bank account, automated invoice and reminder rules. |
| `activity_logs` | Platform audit history. | User identity, action type, entity references, timestamp. |

---

## 🤖 AI Copilot & Human-in-the-Loop Automation

SubscriptIQ combines the reasoning capabilities of Large Language Models with **strict enterprise safety boundaries**:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / Staff
    participant UI as Chat Interface
    participant AI as AI Orchestrator
    participant Tools as Allowlisted Tool Registry
    participant DB as Neon PostgreSQL
    participant Approval as Approval Engine

    Admin->>UI: "Draft due invoices for all active subscriptions"
    UI->>AI: Send prompt + conversation history
    AI->>Tools: Analyze intent & inspect allowlist
    Note over AI,Tools: Consequential action detected: create_invoice_drafts
    AI->>Approval: Queue action in ai_action_approvals (status = pending)
    Approval-->>AI: Action ID #402 created
    AI-->>UI: Return action card requiring human confirmation
    Admin->>UI: Clicks "Approve Action"
    UI->>Approval: POST /api/ai/actions/402/approve
    Approval->>Tools: Execute generate_due_invoices()
    Tools->>DB: Atomically insert invoices & commit
    DB-->>Approval: Success response
    Approval-->>UI: Action completed: 14 invoices created
```

### Safety & Architecture Rules:
1. **Zero Raw SQL from LLMs:** The AI engine communicates exclusively through Python functions in `app/ai/tools.py`.
2. **Strict Pydantic Validation:** Every tool argument is validated against a Pydantic schema before execution.
3. **Role-Based Tool Execution:** Customer accounts are restricted from accessing staff-only analytical tools.
4. **Human-in-the-Loop Approval:** Consequential actions (generating invoices, mass-sending reminder emails) are staged in `ai_action_approvals`. Only an administrator can execute or reject them.

---

## 📡 Backend API Endpoints (80 Paths)

Interactive Swagger UI documentation is available at `http://localhost:8000/docs`.

### Authentication & Profiles (`/api/auth`)
- `POST /api/auth/signup` - Register a customer account
- `POST /api/auth/login` - Authenticate with email/password; returns JWT
- `GET /api/auth/me` - Retrieve current session and linked user profile
- `POST /api/auth/logout` - Revoke current session token
- `POST /api/auth/forgot-password` - Request a non-enumerating password reset
- `POST /api/auth/reset-password` - Complete password reset using single-use token
- `POST /api/auth/change-password` - Update password and invalidate legacy tokens

### Products & Dynamic Variants (`/api/products`, `/api/product-attribute-values`)
- `GET /api/products` - List products with type, search, and pagination filters
- `POST /api/products` - Create a new product (Admin)
- `GET /api/products/{id}` - Product details with attributes and variant prices
- `PATCH /api/products/{id}` - Update product attributes and pricing
- `DELETE /api/products/{id}` - Deactivate or remove a product
- `POST /api/products/{id}/attributes` - Attach attribute definitions (e.g., Brand)
- `POST /api/products/{id}/attributes/{attr_id}/values` - Add variant values with price deltas
- `GET /api/products/{id}/taxes` / `PUT /api/products/{id}/taxes` - Manage product tax associations

### Plans & Cadences (`/api/plans`)
- `GET /api/plans` - List plans (filters: period, active status, search)
- `POST /api/plans` - Create subscription plan with billing frequency and rules
- `GET /api/plans/{id}` - Plan details with associated products
- `PATCH /api/plans/{id}` - Update plan rules (auto-close, early close, pausable)
- `DELETE /api/plans/{id}` - Archive or delete an unused plan

### Quotation Templates (`/api/quotation-templates`)
- `GET /api/quotation-templates` - List templates with lines and validity days
- `POST /api/quotation-templates` - Create reusable sales quote templates
- `GET /api/quotation-templates/{id}` - Template line items and details
- `PUT /api/quotation-templates/{id}` / `DELETE /api/quotation-templates/{id}` - Modify or remove templates

### Subscriptions & Pricing Preview (`/api/subscriptions`)
- `GET /api/subscriptions` - List subscriptions with multi-status and customer filters
- `POST /api/subscriptions` - Create new subscription contract
- `POST /api/subscriptions/preview` - Server-side price, variant, tax, and discount calculation
- `POST /api/subscriptions/from-template` - Convert quotation template into a subscription
- `GET /api/subscriptions/{id}` - Detailed subscription contract with lines and invoices
- `PATCH /api/subscriptions/{id}` - Edit subscription parameters
- `POST /api/subscriptions/{id}/{action}` - Transition state machine (`confirm`, `activate`, `pause`, `resume`, `renew`, `close`)

### Invoicing & Idempotent Generation (`/api/invoices`)
- `GET /api/invoices` - List invoices with status, overdue, and customer filters
- `GET /api/invoices/summary` - Aggregate metrics (total invoiced, paid, overdue, balances)
- `GET /api/invoices/due-preview` - Dry-run preview of due subscriptions awaiting billing
- `POST /api/invoices/generate-due` - Idempotent batch invoice generator
- `GET /api/invoices/{id}` - Full invoice details with line items and payments
- `POST /api/invoices/{id}/confirm` - Transition Draft invoice to Confirmed
- `POST /api/invoices/{id}/send` - Mark invoice as sent to customer
- `POST /api/invoices/{id}/cancel` - Cancel uncollected invoice

### Payments & Accounts Receivable (`/api/payments`)
- `GET /api/payments` - List payment transactions with method and date filtering
- `POST /api/payments` - Record payment against invoice with overpayment protection
- `GET /api/payments/summary` - Financial collection aggregates by method
- `GET /api/payments/{id}` - Transaction receipt and invoice audit details

### Taxes & Promotional Discounts (`/api/taxes`, `/api/discounts`)
- `GET /api/taxes` / `POST /api/taxes` - Manage global tax rules (percentage/fixed)
- `POST /api/taxes/{id}/default` - Assign the system default tax
- `GET /api/discounts` / `POST /api/discounts` - Manage promotional discount rules
- `POST /api/discounts/validate` - Real-time validation of coupon codes and minimum thresholds

### Analytics & Reports (`/api/analytics`, `/api/reports`)
- `GET /api/analytics/summary` - Executive KPIs (MRR, Active Subscriptions, Overdue)
- `GET /api/analytics/revenue-over-time` - Historical monthly revenue trends
- `GET /api/analytics/revenue-by-plan` - Revenue breakdown per subscription plan
- `GET /api/analytics/expiring-subscriptions` - Watchlist of contracts nearing expiry
- `GET /api/reports` - Comprehensive multi-dimensional report with payment delay buckets
- `GET /api/reports/options` - Filter dropdown data for plans and customers
- `GET /api/reports/{type}?export=true` - CSV exports for subscriptions, payments, and revenue

### AI Copilot & Approvals (`/api/ai`)
- `POST /api/ai/chat` - Natural language query processing with conversation history
- `GET /api/ai/conversations/{id}` - Retrieve past conversation transcripts
- `POST /api/ai/actions/{id}/approve` - Execute an approved AI-staged operation
- `POST /api/ai/actions/{id}/reject` - Dismiss a staged AI action

### Customer Self-Service Portal (`/api/portal`)
- `GET /api/portal/summary` - Customer dashboard overview
- `GET /api/portal/profile` / `PATCH /api/portal/profile` - Self-service profile updates
- `GET /api/portal/subscriptions` - View customer's own active contracts
- `GET /api/portal/subscriptions/{id}` - Subscription details and plan terms
- `POST /api/portal/subscriptions/{id}/{action}` - Request subscription changes (pause/close)
- `GET /api/portal/invoices` / `GET /api/portal/invoices/{id}` - View and download tax invoices
- `GET /api/portal/payments` - Personal payment receipts history

### Administration & Settings (`/api/users`, `/api/settings`)
- `GET /api/users` / `POST /api/users` - Admin staff provisioning and user management
- `PATCH /api/users/{id}` - Update staff permissions and activation status
- `POST /api/users/{id}/password-reset` - Trigger invitation or reset token for a user
- `GET /api/settings` / `PATCH /api/settings` - Business profile (GSTIN, bank details, scheduler configs)
- `GET /api/settings/business` - Public business details for invoice rendering

---

## 📂 Project Directory Structure

```text
subscriptiq/
├── backend/
│   ├── alembic/                      # Database migrations
│   │   ├── versions/                 # Alembic version files (head: 9f4ac18e2d71)
│   │   └── env.py                    # Alembic migration environment
│   ├── app/
│   │   ├── ai/                       # AI copilot orchestration
│   │   │   ├── agent.py              # LLM orchestrator & conversational loop
│   │   │   ├── approval_service.py   # Human-in-the-loop approval management
│   │   │   ├── llm_client.py         # Google Gemini & OpenAI client wrappers
│   │   │   ├── tool_registry.py      # Pydantic schemas for allowlisted tools
│   │   │   └── tools.py              # Safe ORM execution tools
│   │   ├── automation/               # Automated background jobs
│   │   │   ├── billing_scheduler.py  # Recurring billing scheduling
│   │   │   ├── jobs.py               # APScheduler recurring jobs
│   │   │   └── renewal_scheduler.py  # Expired subscription transitions
│   │   ├── core/                     # Security, config & dependencies
│   │   │   ├── config.py             # Pydantic BaseSettings environment loader
│   │   │   ├── dependencies.py       # Auth session & database dependencies
│   │   │   ├── permissions.py        # Role-based permission guards (RBAC)
│   │   │   └── security.py           # Argon2 password hashing & JWT handling
│   │   ├── database/                 # Database connection & metadata
│   │   │   ├── base.py               # Declarative SQLAlchemy base
│   │   │   └── connection.py         # Engine & session pool management
│   │   ├── models/                   # 28 SQLAlchemy declarative database models
│   │   │   ├── activity.py           # Audit activity logging
│   │   │   ├── ai.py                 # AI conversations & action approvals
│   │   │   ├── customer.py           # Customer accounts & billing profiles
│   │   │   ├── discount.py           # Discount codes & qualification rules
│   │   │   ├── invoice.py            # Invoices, line items, and billing periods
│   │   │   ├── payment.py            # Payments & financial reconciliation
│   │   │   ├── plan.py               # Subscription plans & billing frequencies
│   │   │   ├── product.py            # Products, attributes, variant values & taxes
│   │   │   ├── quotation.py          # Quotation templates & lines
│   │   │   ├── settings.py           # Business profile & automation configs
│   │   │   ├── subscription.py       # Subscriptions, order lines & histories
│   │   │   ├── tax.py                # Tax definitions & product tax rules
│   │   │   └── user.py               # User accounts & RBAC roles
│   │   ├── routers/                  # 17 FastAPI REST routers
│   │   │   ├── ai.py                 # AI assistant & approval endpoints
│   │   │   ├── analytics.py          # Dashboard analytics & KPI aggregates
│   │   │   ├── auth.py               # Signup, login, reset, & user tokens
│   │   │   ├── customers.py          # Customer CRM management
│   │   │   ├── discounts.py          # Coupon rules & real-time validator
│   │   │   ├── invoices.py           # Invoices, preview, & idempotent generation
│   │   │   ├── payments.py           # Payment recording & AR balances
│   │   │   ├── plans.py              # Subscription plan administration
│   │   │   ├── portal.py             # Customer self-service portal
│   │   │   ├── products.py           # Products, attributes, and variants
│   │   │   ├── quotation_templates.py# Sales quote templates
│   │   │   ├── reports.py            # Multi-dimensional reporting & CSV export
│   │   │   ├── settings.py           # Business settings & preferences
│   │   │   ├── subscriptions.py      # Subscription contracts & lifecycle actions
│   │   │   ├── taxes.py              # Tax rules administration
│   │   │   └── users.py              # User & staff onboarding (Admin)
│   │   ├── schemas/                  # Pydantic request and response schemas
│   │   ├── services/                 # Deterministic business logic
│   │   │   ├── billing_service.py    # Idempotent invoice generator
│   │   │   ├── pricing_service.py    # Server-side price/variant/tax computation
│   │   │   ├── subscription_service.py # Lifecycle state transitions
│   │   │   ├── payment_service.py    # Payment application & balance validation
│   │   │   ├── analytics_service.py  # Financial KPIs & MRR calculation
│   │   │   └── email_service.py      # Transactional email dispatcher
│   │   └── main.py                   # FastAPI initialization & ASGI lifespan
│   ├── scripts/                      # Operational utilities
│   │   ├── check_schema.py           # SQLAlchemy vs PostgreSQL schema audit
│   │   └── seed_demo.py              # Production-grade realistic demo seeder
│   ├── tests/                        # Automated Pytest suite (47+ tests)
│   ├── .env.example                  # Backend environment template
│   ├── alembic.ini                   # Alembic configuration file
│   └── requirements.txt              # Python package dependencies
├── frontend/
│   ├── docs/                         # Component specifications & testing guides
│   ├── public/                       # Static branding & favicon assets
│   ├── src/
│   │   ├── components/               # Modular React UI components
│   │   │   ├── charts/               # Recharts wrappers (Area, Donut, Bar)
│   │   │   ├── common/               # Sidebar, Header, DataTable, StatusBadge
│   │   │   └── ui/                   # Buttons, Modals, Inputs, Toast notifications
│   │   ├── context/                  # AuthContext & global session state
│   │   ├── layouts/                  # AdminLayout & PortalLayout wrappers
│   │   ├── pages/                    # Route pages organized by domain
│   │   │   ├── ai/                   # AI Assistant chat & approval interface
│   │   │   ├── auth/                 # Login, Signup, Forgot/Reset Password
│   │   │   ├── customers/            # Customer directories & detail views
│   │   │   ├── dashboard/            # Executive analytics dashboard
│   │   │   ├── discounts/            # Promotional discount engine UI
│   │   │   ├── invoices/             # Invoice views & batch generation modal
│   │   │   ├── payments/             # Payment history & recording modal
│   │   │   ├── plans/                # Plan configuration UI
│   │   │   ├── portal/               # Customer self-service views
│   │   │   ├── products/             # Product catalog & variant matrix
│   │   │   ├── reports/              # Interactive reports & CSV export
│   │   │   ├── settings/             # Business profile settings
│   │   │   ├── subscriptions/        # Subscription lifecycles & order forms
│   │   │   ├── taxes/                # Tax configuration UI
│   │   │   └── users/                # Staff management UI (Admin)
│   │   ├── routes/                   # RBAC Protected Routes & AppRoutes
│   │   ├── services/                 # Axios API services & mock fallback layer
│   │   └── types/                    # TypeScript interfaces for API contracts
│   ├── .env.example                  # Frontend environment template
│   ├── package.json                  # NPM packages & build scripts
│   ├── tsconfig.json                 # TypeScript project configuration
│   └── vite.config.ts                # Vite bundler configuration
├── database/
│   └── seed.sql                      # Baseline SQL schema & initial data
├── BACKEND_API_DOCUMENTATION.md      # Detailed backend API reference
├── BACKEND_HANDOFF_SUMMARY.md        # Migration, testing, and handoff log
└── README.md                         # Project documentation
```

---

## ⚙️ Prerequisites & Environment Variables

### Prerequisites
- **Node.js:** v18 LTS or newer
- **Python:** v3.11 or newer
- **Database:** A Neon Serverless PostgreSQL instance (or PostgreSQL 15+)
- **AI Credentials (Optional):** Google Gemini API key or OpenAI API key

### 1. Backend Environment Setup (`backend/.env`)
Copy `backend/.env.example` to `backend/.env` and update the parameters:

```env
# Application Settings
APP_NAME=SubscriptIQ
APP_ENV=development
DEBUG=True

# Neon Serverless PostgreSQL
DATABASE_URL=postgresql://username:password@your-neon-pooler-host/neondb?sslmode=require

# Authentication & Security
SECRET_KEY=generate_with_python_secrets_token_urlsafe_32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# AI Configuration (Gemini or OpenAI)
AI_PROVIDER=gemini
AI_API_KEY=your_gemini_api_key_here
AI_MODEL=gemini-2.5-flash
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=2048

# Frontend Web Origin
FRONTEND_URL=http://localhost:5173

# Optional Transactional SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@domain.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_EMAIL=billing@subscriptiq.com
SMTP_STARTTLS=True

# Automation Flags
ENABLE_AUTOMATION=True
AUTO_GENERATE_DUE_INVOICES=False
AUTO_CLOSE_EXPIRED_SUBSCRIPTIONS=True
```

### 2. Frontend Environment Setup (`frontend/.env`)
Copy `frontend/.env.example` to `frontend/.env`:

```env
# FastAPI Backend URL
VITE_API_URL=http://localhost:8000

# Set to false to connect directly to the FastAPI backend
VITE_USE_MOCKS=false

# Optional selective live module overrides when testing in hybrid mock mode
VITE_LIVE_APIS=
```

---

## 🛠 Getting Started & Installation

Run the commands below from the project root.

### Step 1: Backend Setup

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a Python virtual environment
python -m venv venv

# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# macOS/Linux:
source venv/bin/activate

# 3. Upgrade pip and install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# 4. Configure your environment
cp .env.example .env
# Edit .env with your Neon DATABASE_URL and SECRET_KEY

# 5. Apply Alembic database migrations
python -m alembic upgrade head

# 6. Verify database schema parity
python scripts/check_schema.py

# 7. Seed realistic demo data (customers, products, subscriptions, invoices, payments)
python -m scripts.seed_demo

# 8. Start the FastAPI development server
uvicorn app.main:app --reload
```

The backend API will be live at:
- **API Root:** `http://127.0.0.1:8000/`
- **Interactive Swagger Documentation:** `http://127.0.0.1:8000/docs`
- **ReDoc Documentation:** `http://127.0.0.1:8000/redoc`

### Step 2: Frontend Setup

Open a second terminal window from the project root:

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install Node dependencies
npm install

# 3. Configure the frontend environment
cp .env.example .env
# Ensure VITE_USE_MOCKS=false if connecting to your live backend

# 4. Start the Vite development server
npm run dev
```

Open your browser and navigate to `http://localhost:5173`.

---

## 🔑 Demo Accounts & User Personas

The seed script creates pre-configured demo accounts for each role:

| Persona | Email | Password | Access Level |
|---|---|---|---|
| **Administrator** | `admin@subscriptiq.com` | `Admin@1234` | Full access: manage catalog, plan rules, staff users, settings, tax rules, discounts, and approve AI actions. |
| **Internal Staff** | `staff@subscriptiq.com` | `Staff@1234` | Day-to-day operations: manage customers, draft quotes, record payments, view invoices/reports; restricted from settings and user provisioning. |
| **Customer** | `customer@acmeretail.in` | `Customer@1234` | Self-Service Portal: view own active subscriptions, inspect tax invoices, download PDF receipts, and submit change requests. |

---

## 🧪 Testing & Quality Assurance

SubscriptIQ includes an end-to-end automated test suite covering authentication, pricing arithmetic, state transitions, security, and live Neon PostgreSQL integration.

### Running Backend Tests
From the `backend` directory with the virtual environment activated:

```powershell
# Run the complete test suite
pytest

# Run with live Neon PostgreSQL integration assertions enabled
$env:RUN_NEON_INTEGRATION_TESTS="1"; pytest -v
```

**Test Coverage Highlights:**
- `test_pricing_service.py`: Mathematical verification of multi-tier tax computations, variant surcharges, and discount constraints.
- `test_subscription_service.py`: Formal state-machine assertions (`Draft` $\rightarrow$ `Quotation` $\rightarrow$ `Confirmed` $\rightarrow$ `Active` $\rightarrow$ `Closed`).
- `test_auth_security.py`: Argon2 complexity enforcement, JWT expiration, and permission authorization.
- `test_postgres_integration.py`: Live database transaction tests rolled back after execution to ensure data cleanliness.

### Running Frontend Tests & Type Checking
From the `frontend` directory:

```bash
# Run TypeScript compilation check
npm run typecheck

# Validate production production build
npm run build
```

---

## 🎨 UI & Design System

The frontend is styled using a modern dark aesthetic inspired by enterprise analytics dashboards.

### Color Palette Tokens
- **Background (`bg-bg`):** `#1a0a2e` (Deep plum)
- **Surface Cards (`bg-surface`):** `#2a1045` (Rich dark purple)
- **Elevated Inputs/Hovers (`bg-surface-2`):** `#3a1657` (Medium plum)
- **Borders (`border-line`):** `#4a1f6b` (Subtle violet border)
- **Primary Brand (`text-primary` / `bg-primary`):** `#ff2e93` (Vibrant hot pink)
- **Accent Brand (`text-accent` / `bg-accent`):** `#ff8a3d` (Warm orange)
- **Signature Gradient:** `bg-gradient-to-r from-primary to-accent`
- **Semantic Colors:**
  - `success`: `#2ee6a6` (Paid, Active)
  - `danger`: `#ff4d6d` (Overdue, Cancelled)
  - `warning`: `#ffd166` (Pending, Expiring)
  - `violet`: `#9b3cff` (Quotation, Info)

### Shared Component Kit
- `DataTable`: Server-side pagination, search, column sorting, and custom action menus.
- `StatusBadge`: Consistent status styling across subscriptions, invoices, and payments.
- `ConfirmDialog`: Safeguards against destructive actions (canceling contracts, voiding invoices).
- Visual Design Kit available in development at `http://localhost:5173/ui-kit`.

---

## 📄 License

This project is submitted for the **Odoo Hackathon: Subscription Management System**.  
All rights reserved © 2026 SubscriptIQ Team. Available under the MIT License.
