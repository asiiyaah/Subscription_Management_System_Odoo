// Stand-in for GET /api/reports: aggregates the billing mock the way the backend will (SQL GROUP BYs).
import { billingSnapshot } from "@/mocks/billing";
import { localIso, mockDelay } from "@/mocks/utils";
import type { Id, ProductOption } from "@/types/common";
import type { PaymentMethod } from "@/types/invoice";
import type { ReportData, ReportFilters, SubscriptionStatus } from "@/types/report";

const round = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

// Subscriptions not yet billing (or stopped) — owned by the Subscriptions module; here only for the status breakdown.
const PIPELINE: Array<{ number: string; customer_id: number; plan_name: string; status: SubscriptionStatus; mrr: number }> = [
  { number: "SUB-0013", customer_id: 2, plan_name: "Business Monthly", status: "draft", mrr: 3998 },
  { number: "SUB-0014", customer_id: 5, plan_name: "Pro Monthly", status: "quotation", mrr: 4995 },
  { number: "SUB-0015", customer_id: 7, plan_name: "Business Monthly", status: "quotation", mrr: 19990 },
  { number: "SUB-0016", customer_id: 1, plan_name: "Basic Monthly", status: "confirmed", mrr: 998 },
  { number: "SUB-0017", customer_id: 6, plan_name: "Pro Monthly", status: "paused", mrr: 999 },
  { number: "SUB-0018", customer_id: 3, plan_name: "Basic Monthly", status: "closed", mrr: 499 },
  { number: "SUB-0019", customer_id: 8, plan_name: "Pro Monthly", status: "closed", mrr: 2997 },
];
const STATUS_ORDER: SubscriptionStatus[] = ["draft", "quotation", "confirmed", "active", "paused", "closed"];
const TIMING = [
  { bucket: "0–7 days", min: 0, max: 7 },
  { bucket: "8–15 days", min: 8, max: 15 },
  { bucket: "16–30 days", min: 16, max: 30 },
  { bucket: "31+ days", min: 31, max: Infinity },
];
const AGING = [
  { bucket: "1–30 days", min: 1, max: 30 },
  { bucket: "31–60 days", min: 31, max: 60 },
  { bucket: "61–90 days", min: 61, max: 90 },
  { bucket: "90+ days", min: 91, max: Infinity },
];

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00`);
  while (cursor <= end && months.length < 36) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function sumBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => number) {
  const map = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const k = key(row);
    const entry = map.get(k) ?? { total: 0, count: 0 };
    map.set(k, { total: round(entry.total + value(row)), count: entry.count + 1 });
  }
  return map;
}

export const mockReports = {
  async get(filters: ReportFilters): Promise<ReportData> {
    await mockDelay(600);
    const snap = billingSnapshot();
    const { date_from: from, date_to: to, plan, customer_id } = filters;
    const customerId = customer_id || undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const matches = (planName: string, cid: Id) => (!plan || planName === plan) && (!customerId || String(cid) === String(customerId));

    // Invoices / payments in scope
    const invoices = snap.invoices.filter((inv) => matches(inv.plan_name, inv.customer_id));
    const live = invoices.filter((inv) => inv.status !== "draft" && inv.status !== "cancelled");
    const inRange = live.filter((inv) => inv.invoice_date >= from && inv.invoice_date <= to);
    const planByInvoice = new Map<Id, string>(snap.invoices.map((inv) => [inv.id, inv.plan_name]));
    const payments = snap.payments
      .filter((p) => matches(planByInvoice.get(p.invoice_id) ?? "", p.customer_id))
      .filter((p) => p.payment_date >= from && p.payment_date <= to)
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
    const overdueInvoices = live
      .filter((inv) => inv.is_overdue)
      .map((inv) => ({
        id: inv.id,
        number: inv.number,
        customer_name: inv.customer_name,
        plan_name: inv.plan_name,
        due_date: inv.due_date,
        days_overdue: Math.round((today.getTime() - new Date(`${inv.due_date}T00:00:00`).getTime()) / DAY),
        balance: inv.balance,
      }))
      .sort((a, b) => b.days_overdue - a.days_overdue);

    // Subscriptions in scope (billing subscriptions are all active)
    const subscriptions = [
      ...snap.subscriptions.map((s) => ({ ...s, status: "active" as SubscriptionStatus })),
      ...PIPELINE.map((p, i) => ({
        ...p,
        id: 100 + i,
        customer_name: snap.customers.find((c) => c.id === p.customer_id)!.name,
        start_date: localIso(new Date(today.getTime() - (i + 1) * 9 * DAY)),
      })),
    ].filter((s) => matches(s.plan_name, s.customer_id));
    const active = subscriptions.filter((s) => s.status === "active");

    // Monthly series
    const months = monthsBetween(from, to);
    const invoicedByMonth = sumBy(inRange, (inv) => inv.invoice_date.slice(0, 7), (inv) => inv.total);
    const paidByMonth = sumBy(payments, (p) => p.payment_date.slice(0, 7), (p) => p.amount);

    const invoicedByPlan = sumBy(inRange, (inv) => inv.plan_name, (inv) => inv.total);
    const collectedByPlan = sumBy(payments, (p) => planByInvoice.get(p.invoice_id) ?? "Other", (p) => p.amount);
    const byMethod = sumBy(payments, (p) => p.method, (p) => p.amount);
    const statusCounts = sumBy(subscriptions, (s) => s.status, () => 1);

    // Days from invoice to payment
    const invoiceDate = new Map(snap.invoices.map((inv) => [inv.id, inv.invoice_date]));
    const paymentDays = payments.map((p) => ({
      amount: p.amount,
      days: Math.max(0, Math.round((new Date(`${p.payment_date}T00:00:00`).getTime() - new Date(`${invoiceDate.get(p.invoice_id) ?? p.payment_date}T00:00:00`).getTime()) / DAY)),
    }));

    // Unpaid balance at each month end (burn-down)
    const scopedPayments = snap.payments.filter((p) => matches(planByInvoice.get(p.invoice_id) ?? "", p.customer_id));
    const todayIso = localIso(today);
    const outstandingAt = (date: string) => {
      const issued = live.filter((inv) => inv.invoice_date <= date);
      const issuedIds = new Set(issued.map((inv) => inv.id));
      const billed = issued.reduce((s, inv) => s + inv.total, 0);
      const paid = scopedPayments.filter((p) => issuedIds.has(p.invoice_id) && p.payment_date <= date).reduce((s, p) => s + p.amount, 0);
      return round(billed - paid);
    };
    const plansSeen = [...new Set(subscriptions.map((s) => s.plan_name))];

    return {
      summary: {
        active_subscriptions: active.length,
        mrr: round(active.reduce((s, x) => s + x.mrr, 0)),
        invoiced: round(inRange.reduce((s, inv) => s + inv.total, 0)),
        collected: round(payments.reduce((s, p) => s + p.amount, 0)),
        outstanding: round(live.reduce((s, inv) => s + inv.balance, 0)),
        overdue_amount: round(overdueInvoices.reduce((s, inv) => s + inv.balance, 0)),
        overdue_count: overdueInvoices.length,
      },
      revenue_by_month: months.map((month) => ({
        month,
        invoiced: invoicedByMonth.get(month)?.total ?? 0,
        collected: paidByMonth.get(month)?.total ?? 0,
      })),
      revenue_by_plan: snap.plans
        .filter((p) => !plan || p === plan)
        .map((p) => ({ plan: p, invoiced: invoicedByPlan.get(p)?.total ?? 0, collected: collectedByPlan.get(p)?.total ?? 0 }))
        .sort((a, b) => b.invoiced - a.invoiced),
      subscriptions_by_status: STATUS_ORDER.map((status) => ({ status, count: statusCounts.get(status)?.count ?? 0 })),
      subscriptions_by_plan: plansSeen
        .map((p) => {
          const rows = active.filter((s) => s.plan_name === p);
          return { plan: p, count: rows.length, mrr: round(rows.reduce((s, x) => s + x.mrr, 0)) };
        })
        .filter((row) => row.count > 0)
        .sort((a, b) => b.mrr - a.mrr),
      subscriptions: subscriptions
        .map(({ id, number, customer_name, plan_name, status, start_date, mrr }) => ({ id, number, customer_name, plan_name, status, start_date, mrr }))
        .sort((a, b) => a.number.localeCompare(b.number)),
      payments_by_month: months.map((month) => ({
        month,
        amount: paidByMonth.get(month)?.total ?? 0,
        count: paidByMonth.get(month)?.count ?? 0,
      })),
      payments_by_method: [...byMethod.entries()]
        .map(([method, v]) => ({ method: method as PaymentMethod, amount: v.total, count: v.count }))
        .sort((a, b) => b.amount - a.amount),
      payments: payments.slice(0, 100).map(({ id, number, payment_date, customer_name, invoice_id, invoice_number, method, amount }) => ({
        id, number, payment_date, customer_name, invoice_id, invoice_number, method, amount,
      })),
      payments_total: payments.length,
      payment_timing: TIMING.map(({ bucket, min, max }) => {
        const rows = paymentDays.filter((p) => p.days >= min && p.days <= max);
        return { bucket, count: rows.length, amount: round(rows.reduce((s, r) => s + r.amount, 0)) };
      }),
      avg_days_to_pay: paymentDays.length ? Math.round(paymentDays.reduce((s, p) => s + p.days, 0) / paymentDays.length) : null,
      outstanding_by_month: months.map((month) => {
        const [y, m] = month.split("-").map(Number);
        const monthEnd = localIso(new Date(y, m, 0));
        return { month, outstanding: outstandingAt(monthEnd < todayIso ? monthEnd : todayIso) };
      }),
      overdue_aging: AGING.map(({ bucket, min, max }) => {
        const rows = overdueInvoices.filter((inv) => inv.days_overdue >= min && inv.days_overdue <= max);
        return { bucket, amount: round(rows.reduce((s, r) => s + r.balance, 0)), count: rows.length };
      }),
      overdue: overdueInvoices,
    };
  },

  async options(): Promise<{ plans: string[]; customers: ProductOption[] }> {
    await mockDelay(200);
    const snap = billingSnapshot();
    return { plans: snap.plans, customers: snap.customers };
  },
};
