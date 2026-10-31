// In-memory stand-in for the billing backend (invoices + payments) until the API is ready.
// It plays the backend's role: it calculates totals/taxes/discounts and prevents double billing,
// so the pages only display what comes back. Data resets on page reload.
import { ApiError } from "@/services/api";
import { mockDelay, paginate } from "@/mocks/utils";
import type { Paginated } from "@/types/common";
import type {
  DueInvoicePreview,
  GenerateInvoicesResult,
  Invoice,
  InvoiceListQuery,
  InvoicePayment,
  InvoiceStats,
  InvoiceSummaryRow,
  PaymentMethod,
  RecordPaymentRequest,
} from "@/types/invoice";
import type { PaymentListQuery, PaymentRow, PaymentStats } from "@/types/payment";

const DAY = 86_400_000;
const GST_RATE = 0.18;

const round = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// --- Seed: customers, plans, subscriptions -----------------------------------

const CUSTOMERS = [
  { id: 1, name: "Acme Retail", email: "billing@acmeretail.in", address: "12 MG Road, Bengaluru 560001" },
  { id: 2, name: "Nova Labs", email: "accounts@novalabs.io", address: "4th Floor, Cyber Towers, Hyderabad 500081" },
  { id: 3, name: "Pixel Studio", email: "hello@pixelstudio.in", address: "22 Linking Road, Mumbai 400050" },
  { id: 4, name: "Green Grocers", email: "finance@greengrocers.in", address: "8 Anna Salai, Chennai 600002" },
  { id: 5, name: "Urban Fitness", email: "admin@urbanfitness.in", address: "17 Park Street, Kolkata 700016" },
  { id: 6, name: "Zen Clinic", email: "ops@zenclinic.in", address: "3 FC Road, Pune 411004" },
  { id: 7, name: "Bluefin Logistics", email: "ap@bluefin.co.in", address: "Plot 9, Sector 18, Gurugram 122015" },
  { id: 8, name: "Kochi Coffee Co.", email: "billing@kochicoffee.in", address: "45 Marine Drive, Kochi 682031" },
];

const PLANS = [
  { name: "Basic Monthly", product: "Project Management Suite", price: 499 },
  { name: "Pro Monthly", product: "Project Management Suite", price: 999 },
  { name: "Business Monthly", product: "CRM Cloud", price: 1999 },
];

interface MockSubscription {
  id: number;
  number: string;
  customerId: number;
  plan: (typeof PLANS)[number];
  quantity: number;
  billingDay: number;
  addOn?: { name: string; price: number };
  discount?: { code: string; label: string; rate: number };
}

const SUBSCRIPTIONS: MockSubscription[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  number: `SUB-${String(i + 1).padStart(4, "0")}`,
  customerId: (i % CUSTOMERS.length) + 1,
  plan: PLANS[i % PLANS.length],
  quantity: [1, 3, 5, 2, 10, 1][i % 6],
  billingDay: ((i * 5) % 26) + 1,
  addOn: i % 4 === 1 ? { name: "Priority Support (add-on)", price: 199 } : undefined,
  discount: i % 5 === 2 ? { code: "SEATS10", label: "10% off for 5+ seats", rate: 0.1 } : undefined,
}));

// --- Invoice builder (the "backend" maths) -----------------------------------

let nextInvoiceId = 1;
let nextLineId = 1;
let nextPaymentId = 1;

function periodStart(sub: MockSubscription, monthOffset: number): Date {
  const t = today();
  return new Date(t.getFullYear(), t.getMonth() + monthOffset, sub.billingDay);
}

function buildInvoice(sub: MockSubscription, start: Date, status: Invoice["status"]): Invoice {
  const customer = CUSTOMERS.find((c) => c.id === sub.customerId)!;
  const end = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1);
  const due = new Date(start.getTime() + 15 * DAY);
  const discountRate = sub.discount?.rate ?? 0;

  const rawLines = [
    { product_name: sub.plan.product, description: `${sub.plan.name} · ${sub.quantity} seat(s)`, quantity: sub.quantity, unit_price: sub.plan.price },
    ...(sub.addOn ? [{ product_name: sub.addOn.name, description: "Monthly add-on", quantity: 1, unit_price: sub.addOn.price }] : []),
  ];
  const lines = rawLines.map((line) => {
    const amount = round(line.quantity * line.unit_price);
    return { ...line, id: nextLineId++, amount, tax_label: "GST 18%", tax_amount: round(amount * (1 - discountRate) * GST_RATE) };
  });

  const untaxed = round(lines.reduce((sum, l) => sum + l.amount, 0));
  const discountAmount = round(untaxed * discountRate);
  const taxTotal = round(lines.reduce((sum, l) => sum + l.tax_amount, 0));
  const total = round(untaxed - discountAmount + taxTotal);

  return {
    id: nextInvoiceId++,
    number: "",
    status,
    is_overdue: false,
    customer_id: customer.id,
    customer_name: customer.name,
    customer_email: customer.email,
    customer_address: customer.address,
    subscription_id: sub.id,
    subscription_number: sub.number,
    plan_name: sub.plan.name,
    invoice_date: iso(start),
    due_date: iso(due),
    period_start: iso(start),
    period_end: iso(end),
    payment_terms: "Net 15",
    lines,
    untaxed_amount: untaxed,
    discount: sub.discount ? { code: sub.discount.code, label: sub.discount.label, amount: discountAmount } : undefined,
    taxes: [
      { label: "CGST 9%", amount: round(taxTotal / 2) },
      { label: "SGST 9%", amount: round(taxTotal - round(taxTotal / 2)) },
    ],
    tax_total: taxTotal,
    total,
    amount_paid: 0,
    balance: total,
    payments: [],
  };
}

function addPayment(invoice: Invoice, amount: number, date: string, method: PaymentMethod, note?: string) {
  const id = nextPaymentId++;
  const payment: InvoicePayment = {
    id,
    number: `PAY-${String(id).padStart(4, "0")}`,
    payment_date: date,
    method,
    amount: round(amount),
    note,
  };
  invoice.payments.push(payment);
  invoice.amount_paid = round(invoice.amount_paid + amount);
  invoice.balance = round(invoice.total - invoice.amount_paid);
  if (invoice.balance <= 0) invoice.status = "paid";
}

const METHODS: PaymentMethod[] = ["upi", "bank_transfer", "card", "cash"];

function seed(): Invoice[] {
  const invoices: Invoice[] = [];
  const t = today();
  SUBSCRIPTIONS.forEach((sub, i) => {
    for (const offset of [-3, -2, -1, 0]) {
      const start = periodStart(sub, offset);
      if (start > t) continue;
      // Every third subscription's current period is left un-invoiced → shows up in "Generate due invoices".
      if (offset === 0 && i % 3 === 0) continue;

      const invoice = buildInvoice(sub, start, offset === 0 ? (i % 2 ? "draft" : "confirmed") : "confirmed");
      const payDate = iso(new Date(Math.min(start.getTime() + 7 * DAY, t.getTime())));

      if (offset <= -2) {
        if (i === 4 && offset === -2) invoice.status = "cancelled";
        else addPayment(invoice, invoice.total, payDate, METHODS[i % METHODS.length], i % 3 === 0 ? `UTR ${410000 + i * 37}` : undefined);
      } else if (offset === -1) {
        if (i % 4 === 0) addPayment(invoice, invoice.total, payDate, METHODS[(i + 1) % METHODS.length]);
        else if (i % 4 === 1) addPayment(invoice, round(invoice.total / 2), payDate, "bank_transfer", "Part payment");
        // otherwise left unpaid → overdue once past the due date
      }
      invoices.push(invoice);
    }
  });

  invoices.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.id - b.id);
  invoices.forEach((inv, index) => {
    inv.number = `INV-${inv.invoice_date.slice(0, 4)}-${String(index + 1).padStart(4, "0")}`;
  });

  // Number seeded payments in date order so PAY-0001 is the oldest.
  invoices
    .flatMap((inv) => inv.payments)
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date) || a.id - b.id)
    .forEach((payment, index) => {
      payment.id = index + 1;
      payment.number = `PAY-${String(index + 1).padStart(4, "0")}`;
    });
  return invoices;
}

const INVOICES: Invoice[] = seed();

function refreshOverdue(invoice: Invoice): Invoice {
  invoice.is_overdue = invoice.status === "confirmed" && invoice.balance > 0 && invoice.due_date < iso(today());
  return invoice;
}

function findInvoice(id: number): Invoice {
  const invoice = INVOICES.find((inv) => inv.id === id);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  return refreshOverdue(invoice);
}

function toRow(inv: Invoice): InvoiceSummaryRow {
  const { id, number, status, is_overdue, customer_id, customer_name, subscription_id, subscription_number, invoice_date, due_date, total, amount_paid, balance } =
    refreshOverdue(inv);
  return { id, number, status, is_overdue, customer_id, customer_name, subscription_id, subscription_number, invoice_date, due_date, total, amount_paid, balance };
}

// --- Mock API ------------------------------------------------------------------

export const mockInvoices = {
  async list(query: InvoiceListQuery): Promise<Paginated<InvoiceSummaryRow>> {
    await mockDelay();
    const { overdue, customer_id, subscription_id, ...rest } = query;
    let rows = INVOICES.map(toRow);
    if (overdue === "true") rows = rows.filter((r) => r.is_overdue);
    if (customer_id) rows = rows.filter((r) => r.customer_id === Number(customer_id));
    if (subscription_id) rows = rows.filter((r) => r.subscription_id === Number(subscription_id));
    return paginate(rows, rest, ["number", "customer_name", "subscription_number"]);
  },

  async stats(): Promise<InvoiceStats> {
    await mockDelay(300);
    const rows = INVOICES.map(toRow);
    const live = rows.filter((r) => r.status !== "cancelled" && r.status !== "draft");
    const count = (status: string) => rows.filter((r) => r.status === status).length;
    return {
      counts: {
        all: rows.length,
        draft: count("draft"),
        confirmed: count("confirmed"),
        paid: count("paid"),
        cancelled: count("cancelled"),
        overdue: rows.filter((r) => r.is_overdue).length,
      },
      total_invoiced: round(live.reduce((s, r) => s + r.total, 0)),
      total_paid: round(live.reduce((s, r) => s + r.amount_paid, 0)),
      outstanding: round(live.reduce((s, r) => s + r.balance, 0)),
      overdue_amount: round(rows.filter((r) => r.is_overdue).reduce((s, r) => s + r.balance, 0)),
    };
  },

  async get(id: number): Promise<Invoice> {
    await mockDelay(300);
    return structuredClone(findInvoice(id));
  },

  async confirm(id: number): Promise<Invoice> {
    await mockDelay();
    const invoice = findInvoice(id);
    if (invoice.status !== "draft") throw new ApiError(409, "Only draft invoices can be confirmed.");
    invoice.status = "confirmed";
    return structuredClone(refreshOverdue(invoice));
  },

  async cancel(id: number): Promise<Invoice> {
    await mockDelay();
    const invoice = findInvoice(id);
    if (invoice.status === "paid" || invoice.status === "cancelled") {
      throw new ApiError(409, `A ${invoice.status} invoice can't be cancelled.`);
    }
    if (invoice.amount_paid > 0) throw new ApiError(409, "This invoice already has payments, so it can't be cancelled.");
    invoice.status = "cancelled";
    return structuredClone(refreshOverdue(invoice));
  },

  async send(id: number): Promise<{ message: string }> {
    await mockDelay();
    const invoice = findInvoice(id);
    if (invoice.status === "draft" || invoice.status === "cancelled") {
      throw new ApiError(409, "Confirm the invoice before sending it.");
    }
    invoice.sent_at = new Date().toISOString();
    return { message: `Invoice sent to ${invoice.customer_email}` };
  },

  async duePreview(): Promise<DueInvoicePreview[]> {
    await mockDelay();
    const t = today();
    return SUBSCRIPTIONS.flatMap((sub) => {
      const start = periodStart(sub, 0);
      if (start > t) return [];
      const customer = CUSTOMERS.find((c) => c.id === sub.customerId)!;
      const alreadyBilled = INVOICES.some(
        (inv) => inv.subscription_id === sub.id && inv.period_start === iso(start) && inv.status !== "cancelled",
      );
      const draft = buildInvoice(sub, start, "draft");
      nextInvoiceId--; // preview only — don't consume an id
      return [
        {
          subscription_id: sub.id,
          subscription_number: sub.number,
          customer_name: customer.name,
          plan_name: sub.plan.name,
          period_start: draft.period_start,
          period_end: draft.period_end,
          estimated_total: draft.total,
          status: alreadyBilled ? "skipped" : "ready",
          skip_reason: alreadyBilled ? "Already invoiced for this period" : undefined,
        } satisfies DueInvoicePreview,
      ];
    });
  },

  async generateDue(): Promise<GenerateInvoicesResult> {
    await mockDelay(900);
    const preview = await this.duePreview();
    const ids: number[] = [];
    for (const row of preview.filter((p) => p.status === "ready")) {
      const sub = SUBSCRIPTIONS.find((s) => s.id === row.subscription_id)!;
      const invoice = buildInvoice(sub, new Date(row.period_start), "draft");
      invoice.number = `INV-${invoice.invoice_date.slice(0, 4)}-${String(INVOICES.length + 1).padStart(4, "0")}`;
      INVOICES.push(invoice);
      ids.push(invoice.id);
    }
    return { created: ids.length, skipped: preview.length - ids.length, invoice_ids: ids };
  },
};

export const mockPayments = {
  async record(request: RecordPaymentRequest): Promise<Invoice> {
    await mockDelay();
    const invoice = findInvoice(request.invoice_id);
    if (invoice.status !== "confirmed") throw new ApiError(409, "Payments can only be recorded on confirmed invoices.");
    if (request.amount <= 0) throw new ApiError(422, "Amount must be greater than 0.");
    if (request.amount > invoice.balance) throw new ApiError(422, "Amount can't be more than the balance due.");
    addPayment(invoice, request.amount, request.payment_date, request.method, request.note);
    return structuredClone(refreshOverdue(invoice));
  },

  async list(query: PaymentListQuery): Promise<Paginated<PaymentRow>> {
    await mockDelay();
    const { date_from, date_to, customer_id, invoice_id, ...rest } = query;
    let rows = allPaymentRows();
    if (date_from) rows = rows.filter((r) => r.payment_date >= date_from);
    if (date_to) rows = rows.filter((r) => r.payment_date <= date_to);
    if (customer_id) rows = rows.filter((r) => r.customer_id === Number(customer_id));
    if (invoice_id) rows = rows.filter((r) => r.invoice_id === Number(invoice_id));
    return paginate(rows, rest, ["number", "customer_name", "invoice_number", "note"]);
  },

  async stats(): Promise<PaymentStats> {
    await mockDelay(300);
    const monthPrefix = iso(today()).slice(0, 7);
    const thisMonth = allPaymentRows().filter((r) => r.payment_date.startsWith(monthPrefix));

    const byMethod = new Map<PaymentMethod, { amount: number; count: number }>();
    for (const row of thisMonth) {
      const entry = byMethod.get(row.method) ?? { amount: 0, count: 0 };
      byMethod.set(row.method, { amount: round(entry.amount + row.amount), count: entry.count + 1 });
    }
    const by_method = [...byMethod.entries()]
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.amount - a.amount);

    return {
      collected_this_month: round(thisMonth.reduce((s, r) => s + r.amount, 0)),
      payments_this_month: thisMonth.length,
      top_method: by_method[0]?.method ?? null,
      outstanding: round(INVOICES.filter((inv) => inv.status === "confirmed").reduce((s, inv) => s + inv.balance, 0)),
      by_method,
    };
  },
};

function allPaymentRows(): PaymentRow[] {
  return INVOICES.flatMap((inv) =>
    inv.payments.map((p) => ({
      ...p,
      invoice_id: inv.id,
      invoice_number: inv.number,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name,
    })),
  );
}

// --- Read-only insights for the AI assistant mock (mocks/ai.ts) --------------------
// The real AI service calls backend functions that compute these from the database.

// Contract end dates, spread so a few fall within the next week or two.
const CONTRACT_END_OFFSETS = [3, 6, 12, 25, 40, 2, 70, 9, 5, 100, 15, 30];

function monthlyValue(sub: MockSubscription): number {
  const base = sub.plan.price * sub.quantity + (sub.addOn?.price ?? 0);
  return round(base * (1 - (sub.discount?.rate ?? 0)));
}

export const billingInsights = {
  expiringSubscriptions(days: number) {
    const t = today();
    return SUBSCRIPTIONS.map((sub, i) => ({
      subscription_id: sub.id,
      subscription_number: sub.number,
      customer_name: CUSTOMERS.find((c) => c.id === sub.customerId)!.name,
      customer_email: CUSTOMERS.find((c) => c.id === sub.customerId)!.email,
      plan_name: sub.plan.name,
      end_date: iso(new Date(t.getTime() + CONTRACT_END_OFFSETS[i] * DAY)),
      days_left: CONTRACT_END_OFFSETS[i],
      monthly_value: monthlyValue(sub),
    }))
      .filter((row) => row.days_left <= days)
      .sort((a, b) => a.days_left - b.days_left);
  },

  overdueInvoices() {
    return INVOICES.map(refreshOverdue)
      .filter((inv) => inv.is_overdue)
      .map((inv) => ({
        id: inv.id,
        number: inv.number,
        customer_name: inv.customer_name,
        due_date: inv.due_date,
        days_overdue: Math.round((today().getTime() - new Date(inv.due_date).getTime()) / DAY),
        balance: inv.balance,
      }))
      .sort((a, b) => b.days_overdue - a.days_overdue);
  },

  revenueSummary() {
    const monthPrefix = iso(today()).slice(0, 7);
    const live = INVOICES.map(refreshOverdue).filter((inv) => inv.status !== "cancelled" && inv.status !== "draft");
    return {
      mrr: round(SUBSCRIPTIONS.reduce((sum, sub) => sum + monthlyValue(sub), 0)),
      active_subscriptions: SUBSCRIPTIONS.length,
      collected_this_month: round(allPaymentRows().filter((p) => p.payment_date.startsWith(monthPrefix)).reduce((s, p) => s + p.amount, 0)),
      outstanding: round(live.reduce((s, inv) => s + inv.balance, 0)),
      overdue: round(live.filter((inv) => inv.is_overdue).reduce((s, inv) => s + inv.balance, 0)),
    };
  },

  revenueByPlan() {
    const byPlan = new Map<string, { revenue: number; subscriptions: number; mrr: number }>();
    for (const plan of PLANS) byPlan.set(plan.name, { revenue: 0, subscriptions: 0, mrr: 0 });
    for (const sub of SUBSCRIPTIONS) {
      const entry = byPlan.get(sub.plan.name)!;
      entry.subscriptions += 1;
      entry.mrr = round(entry.mrr + monthlyValue(sub));
    }
    for (const inv of INVOICES) {
      const entry = byPlan.get(inv.plan_name);
      if (entry) entry.revenue = round(entry.revenue + inv.amount_paid);
    }
    return [...byPlan.entries()].map(([plan_name, v]) => ({ plan_name, ...v })).sort((a, b) => b.revenue - a.revenue);
  },

  outstandingByCustomer() {
    const byCustomer = new Map<string, { invoices: number; balance: number; overdue: number }>();
    for (const inv of INVOICES.map(refreshOverdue)) {
      if (inv.status !== "confirmed" || inv.balance <= 0) continue;
      const entry = byCustomer.get(inv.customer_name) ?? { invoices: 0, balance: 0, overdue: 0 };
      entry.invoices += 1;
      entry.balance = round(entry.balance + inv.balance);
      if (inv.is_overdue) entry.overdue = round(entry.overdue + inv.balance);
      byCustomer.set(inv.customer_name, entry);
    }
    return [...byCustomer.entries()].map(([customer_name, v]) => ({ customer_name, ...v })).sort((a, b) => b.balance - a.balance);
  },
};

// --- Raw data for the Reports mock (mocks/reports.ts) ------------------------------

/** Snapshot of the billing data; the Reports mock aggregates it the way the backend would. */
export function billingSnapshot() {
  const t = today();
  return {
    customers: CUSTOMERS.map(({ id, name }) => ({ id, name })),
    plans: PLANS.map((p) => p.name),
    subscriptions: SUBSCRIPTIONS.map((sub, i) => ({
      id: sub.id,
      number: sub.number,
      customer_id: sub.customerId,
      customer_name: CUSTOMERS.find((c) => c.id === sub.customerId)!.name,
      plan_name: sub.plan.name,
      // Billing history above starts 3 months back, so these started 4–9 months ago.
      start_date: iso(new Date(t.getFullYear(), t.getMonth() - 4 - (i % 6), sub.billingDay)),
      mrr: monthlyValue(sub),
    })),
    invoices: INVOICES.map((inv) => structuredClone(refreshOverdue(inv))),
    payments: allPaymentRows(),
  };
}
