import { api, isLive, num, toApiError } from "@/services/api";
import { mockPortal } from "@/mocks/portal";
import { normalizeInvoice } from "@/services/invoiceService";
import type { Id, Paginated } from "@/types/common";
import type { Invoice, InvoiceListQuery, InvoiceSummaryRow } from "@/types/invoice";
import type { PortalSubscription, PortalSummary } from "@/types/portal";

/** Customer portal (R6): every endpoint returns only the signed-in customer's own data (from the token). */
const LIVE = isLive("portal");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

interface ApiSummary {
  customer_name: string;
  active_subscriptions: number;
  outstanding: number;
  overdue_amount: number;
  recent_invoices: InvoiceSummaryRow[];
}

interface ApiPortalSubscription {
  id: string;
  subscription_number: string;
  status: string;
  next_billing_date: string | null;
  total: number | string;
}

/**
 * The backend summary has totals and recent invoices; the subscription list and the
 * "next payment" invoice come from two small extra calls, made in parallel.
 */
async function liveSummary(): Promise<PortalSummary> {
  const [summary, subs, unpaid] = await Promise.all([
    request<ApiSummary>(() => api.get("/api/portal/summary")),
    request<{ items: ApiPortalSubscription[] }>(() => api.get("/api/portal/subscriptions", { params: { page_size: 50 } })),
    request<Paginated<InvoiceSummaryRow>>(() => api.get("/api/portal/invoices", { params: { unpaid: true, page_size: 100 } })),
  ]);
  const next = [...unpaid.items].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return {
    customer_name: summary.customer_name,
    active_subscriptions: summary.active_subscriptions,
    outstanding: num(summary.outstanding),
    overdue_amount: num(summary.overdue_amount),
    next_due: next
      ? { invoice_id: next.id, number: next.number, due_date: next.due_date, balance: num(next.balance), is_overdue: next.is_overdue }
      : null,
    subscriptions: subs.items.map((s) => ({
      id: s.id,
      number: s.subscription_number,
      plan_name: "",
      status: s.status,
      next_invoice_date: s.next_billing_date,
      monthly_amount: num(s.total),
    })),
    recent_invoices: summary.recent_invoices.map(normalizeInvoice),
  };
}

export const portalService = {
  summary(): Promise<PortalSummary> {
    return LIVE ? liveSummary() : mockPortal.summary();
  },

  async subscriptions(): Promise<Paginated<PortalSubscription>> {
    if (!LIVE) {
      const summary = await mockPortal.summary();
      const items = summary.subscriptions.map((subscription) => ({
        id: subscription.id,
        subscription_number: subscription.number,
        plan_name: subscription.plan_name,
        status: subscription.status,
        next_billing_date: subscription.next_invoice_date,
        total: subscription.monthly_amount,
      }));
      return { items, total: items.length, page: 1, page_size: 100 };
    }
    return request(() => api.get("/api/portal/subscriptions", { params: { page: 1, page_size: 100 } }));
  },

  async subscription(id: Id): Promise<PortalSubscription> {
    if (!LIVE) {
      const match = (await this.subscriptions()).items.find((subscription) => String(subscription.id) === String(id));
      if (!match) throw new Error("Subscription not found.");
      return match;
    }
    return request(() => api.get(`/api/portal/subscriptions/${id}`));
  },

  async subscriptionAction(id: Id, action: "pause" | "resume" | "close" | "renew") {
    if (!LIVE) throw new Error("Subscription actions require the live backend.");
    return request(() => api.post(`/api/portal/subscriptions/${id}/${action}`));
  },

  /** Extra filter: `unpaid=true`. Drafts are never returned. */
  async invoices(query: InvoiceListQuery & { unpaid?: "true" }): Promise<Paginated<InvoiceSummaryRow>> {
    if (!LIVE) return mockPortal.invoices(query);
    const { search, ...rest } = query;
    const page = await request<Paginated<InvoiceSummaryRow>>(() =>
      api.get("/api/portal/invoices", { params: { ...rest, q: search || undefined } }),
    );
    return { ...page, items: page.items.map(normalizeInvoice) };
  },

  async invoice(id: Id): Promise<Invoice> {
    if (!LIVE) return mockPortal.invoice(id);
    return normalizeInvoice(await request<Invoice>(() => api.get(`/api/portal/invoices/${id}`)));
  },
};
