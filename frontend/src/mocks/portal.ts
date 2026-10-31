// Stand-in for /api/portal/*. Every call is scoped to the signed-in customer (R6) —
// the real backend takes the customer from the JWT, never from the request.
import { ApiError } from "@/services/api";
import { customerIdForName, mockInvoices, portalInvoice, portalSummary } from "@/mocks/billing";
import { mockDelay } from "@/mocks/utils";
import { tokenStorage } from "@/lib/tokenStorage";
import { loadUsers } from "@/mocks/auth";
import type { Id, Paginated } from "@/types/common";
import type { Invoice, InvoiceListQuery, InvoiceSummaryRow } from "@/types/invoice";
import type { PortalSubscription, PortalSummary } from "@/types/portal";

const actionStates = new Map<string, { status: string; end_date: string | null; next_billing_date: string | null; history: NonNullable<PortalSubscription["history"]> }>();

function mockSubscriptionRow(row: PortalSummary["subscriptions"][number]): PortalSubscription {
  const saved = actionStates.get(String(row.id));
  const options = row.plan_name.includes("Pro")
    ? { is_pausable: true, is_renewable: true, allows_early_closure: true }
    : row.plan_name.includes("Business")
      ? { is_pausable: true, is_renewable: true, allows_early_closure: false }
      : { is_pausable: false, is_renewable: true, allows_early_closure: false };
  return {
    id: row.id,
    subscription_number: row.number,
    plan_name: row.plan_name,
    status: saved?.status ?? row.status,
    start_date: null,
    end_date: saved?.end_date ?? null,
    billing_period: "monthly",
    billing_interval: 1,
    next_billing_date: saved?.next_billing_date ?? row.next_invoice_date,
    monthly_amount: row.monthly_amount,
    subtotal: row.monthly_amount,
    discount_total: 0,
    tax_total: 0,
    total: row.monthly_amount,
    notes: null,
    history: saved?.history ?? [],
    ...options,
    lines: [{
      product_id: `mock-product-${row.id}`,
      plan_id: `mock-plan-${row.id}`,
      product_name: row.plan_name,
      plan_name: row.plan_name,
      description: row.plan_name,
      quantity: 1,
      unit_price: row.monthly_amount,
      discount_amount: 0,
      tax_amount: 0,
      line_total: row.monthly_amount,
    }],
  };
}

function scopedRows(customerId: number): PortalSubscription[] {
  return portalSummary(customerId).subscriptions.map(mockSubscriptionRow);
}

function currentCustomerId(): number | null {
  const user = tokenStorage.getUser();
  if (!user || user.role !== "customer") throw new ApiError(403, "This area is for customers.");
  // Linked by company (falls back to the account name), so renaming yourself doesn't lose your data.
  const record = loadUsers().find((u) => u.id === user.id);
  return customerIdForName(record?.company || record?.name || user.name);
}

export const mockPortal = {
  async summary(): Promise<PortalSummary> {
    await mockDelay(400);
    const customerId = currentCustomerId();
    if (customerId === null) {
      // New sign-up with no subscriptions yet.
      return { customer_name: tokenStorage.getUser()!.name, active_subscriptions: 0, outstanding: 0, overdue_amount: 0, next_due: null, subscriptions: [], recent_invoices: [] };
    }
    const summary = portalSummary(customerId);
    const subscriptions = scopedRows(customerId);
    return {
      ...summary,
      active_subscriptions: subscriptions.filter((subscription) => subscription.status === "active").length,
      subscriptions: summary.subscriptions.map((row) => {
        const state = actionStates.get(String(row.id));
        return { ...row, status: state?.status ?? row.status, next_invoice_date: state?.next_billing_date ?? row.next_invoice_date };
      }),
    };
  },

  async subscriptions(query: { page: number; page_size: number; search?: string; status?: string }): Promise<Paginated<PortalSubscription>> {
    await mockDelay(250);
    const customerId = currentCustomerId();
    if (customerId === null) return { items: [], total: 0, page: query.page, page_size: query.page_size };
    let rows = scopedRows(customerId);
    if (query.search?.trim()) {
      const term = query.search.trim().toLowerCase();
      rows = rows.filter((row) => row.subscription_number.toLowerCase().includes(term) || row.plan_name.toLowerCase().includes(term));
    }
    if (query.status) rows = rows.filter((row) => row.status === query.status);
    const start = (query.page - 1) * query.page_size;
    return { items: rows.slice(start, start + query.page_size), total: rows.length, page: query.page, page_size: query.page_size };
  },

  async subscription(id: Id): Promise<PortalSubscription> {
    await mockDelay(250);
    const customerId = currentCustomerId();
    if (customerId === null) throw new ApiError(404, "Subscription not found.");
    const row = scopedRows(customerId).find((subscription) => String(subscription.id) === String(id));
    if (!row) throw new ApiError(404, "Subscription not found.");
    return row;
  },

  async subscriptionAction(id: Id, action: "pause" | "resume" | "close" | "renew"): Promise<PortalSubscription> {
    const row = await this.subscription(id);
    const invalid = () => { throw new ApiError(409, `This subscription cannot ${action} under its current status or plan options.`); };
    if (action === "pause" && (row.status !== "active" || !row.is_pausable)) invalid();
    if (action === "resume" && (row.status !== "paused" || !row.is_renewable)) invalid();
    if (action === "renew" && (!row.is_renewable || !["active", "closed"].includes(row.status))) invalid();
    if (action === "close" && (row.status === "closed" || (!row.allows_early_closure && !row.end_date))) invalid();
    const status = action === "pause" ? "paused" : action === "resume" || action === "renew" ? "active" : "closed";
    const history = [...(row.history ?? []), { previous_status: row.status, new_status: status, action: `customer_${action}`, created_at: new Date().toISOString() }];
    const endDate = action === "close" ? new Date().toISOString().slice(0, 10) : action === "renew" ? null : row.end_date ?? null;
    let nextBillingDate = row.next_billing_date;
    if (action === "renew") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const current = row.next_billing_date ? new Date(`${row.next_billing_date}T00:00:00`) : today;
      const anchor = current > today ? current : today;
      const day = anchor.getDate();
      anchor.setDate(1);
      anchor.setMonth(anchor.getMonth() + 1);
      anchor.setDate(Math.min(day, new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()));
      nextBillingDate = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getDate()).padStart(2, "0")}`;
    }
    actionStates.set(String(id), { status, end_date: endDate, next_billing_date: nextBillingDate, history });
    return { ...row, status, history, end_date: endDate, next_billing_date: nextBillingDate };
  },

  async invoices(query: InvoiceListQuery): Promise<Paginated<InvoiceSummaryRow>> {
    const customerId = currentCustomerId();
    if (customerId === null) {
      await mockDelay(300);
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }
    // Customers never see drafts; "unpaid" = confirmed with a balance.
    const { unpaid, ...rest } = query as InvoiceListQuery & { unpaid?: string };
    return mockInvoices.list({
      ...rest,
      customer_id: customerId,
      exclude_draft: "true",
      ...(unpaid === "true" ? { status: "confirmed" as const } : {}),
    } as InvoiceListQuery);
  },

  async invoice(id: Id): Promise<Invoice> {
    await mockDelay(300);
    const customerId = currentCustomerId();
    if (customerId === null) throw new ApiError(404, "Invoice not found.");
    return portalInvoice(customerId, id);
  },
};
