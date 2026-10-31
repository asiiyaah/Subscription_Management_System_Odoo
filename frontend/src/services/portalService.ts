import { api, isLive, num, toApiError } from "@/services/api";
import { mockPortal } from "@/mocks/portal";
import { normalizeInvoice } from "@/services/invoiceService";
import type { Id, Paginated } from "@/types/common";
import type { Invoice, InvoiceListQuery, InvoiceSummaryRow } from "@/types/invoice";
import type { PortalSubscription, PortalSubscriptionListQuery, PortalSummary } from "@/types/portal";
import type { Subscription } from "@/types/subscription";

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

type ApiPortalSubscription = PortalSubscription;

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

  async subscriptions(query: PortalSubscriptionListQuery = { page: 1, page_size: 20 }): Promise<Paginated<PortalSubscription>> {
    if (!LIVE) return mockPortal.subscriptions(query);
    const params = { page: query.page, page_size: query.page_size };
    const [portalPage, subscriptionPage] = await Promise.all([
      request<Paginated<ApiPortalSubscription>>(() => api.get("/api/portal/subscriptions", { params })),
      // This endpoint also enforces customer_id from the authenticated user and exposes dates/intervals.
      request<Paginated<Subscription>>(() => api.get("/api/subscriptions", { params })),
    ]);
    const details = new Map(subscriptionPage.items.map((row) => [String(row.id), row]));
    return {
      ...portalPage,
      items: portalPage.items.map((portalRow) => {
        const full = details.get(String(portalRow.id));
        if (!full) return portalRow;
        return {
          ...full,
          ...portalRow,
          total: full.total,
          monthly_amount: portalRow.total,
          lines: full.lines.map((line, index) => ({ ...line, ...portalRow.lines?.[index] })),
        };
      }),
      total: subscriptionPage.total,
      page: subscriptionPage.page,
      page_size: subscriptionPage.page_size,
    };
  },

  async subscription(id: Id): Promise<PortalSubscription> {
    if (!LIVE) return mockPortal.subscription(id);
    const [portalRow, full] = await Promise.all([
      request<ApiPortalSubscription>(() => api.get(`/api/portal/subscriptions/${id}`)),
      // The general endpoint is customer-scoped for customer-role tokens and exposes price/date/history fields.
      request<Subscription>(() => api.get(`/api/subscriptions/${id}`)),
    ]);
    return {
      ...full,
      ...portalRow,
      total: full.total,
      // The detail endpoint's `total` is the subscription total, not the list's monthly-normalized value.
      monthly_amount: undefined,
      lines: full.lines.map((line, index) => ({ ...line, ...portalRow.lines?.[index] })),
    };
  },

  async subscriptionAction(id: Id, action: "pause" | "resume" | "close" | "renew") {
    if (!LIVE) return mockPortal.subscriptionAction(id, action);
    // The portal renew handler currently omits the active/closed status check. The shared
    // subscription action endpoint also permits customer renewals, scopes the id to that
    // customer, and enforces the allowed renewal states.
    if (action === "renew") return request(() => api.post(`/api/subscriptions/${id}/renew`));
    return request(() => api.post(`/api/portal/subscriptions/${id}/${action}`));
  },

  async subscriptionInvoices(id: Id): Promise<InvoiceSummaryRow[]> {
    if (!LIVE) return mockPortal.subscriptionInvoices(id);
    // GET /api/invoices supports subscription_id and scopes customer-role requests to the JWT customer.
    // The portal invoice list has no subscription_id filter, so use the existing filtered invoice endpoint.
    const statuses = ["confirmed", "paid", "cancelled"] as const;
    const pages = await Promise.all(statuses.map((status) => request<Paginated<InvoiceSummaryRow>>(() =>
      api.get("/api/invoices", { params: { subscription_id: id, status, page: 1, page_size: 100 } }),
    )));
    return pages.flatMap((page) => page.items);
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
