// Stand-in for /api/portal/*. Every call is scoped to the signed-in customer (R6) —
// the real backend takes the customer from the JWT, never from the request.
import { ApiError } from "@/services/api";
import { customerIdForName, mockInvoices, portalInvoice, portalSummary } from "@/mocks/billing";
import { mockDelay } from "@/mocks/utils";
import { tokenStorage } from "@/lib/tokenStorage";
import { loadUsers } from "@/mocks/auth";
import type { Id, Paginated } from "@/types/common";
import type { Invoice, InvoiceListQuery, InvoiceSummaryRow } from "@/types/invoice";
import type { PortalSummary } from "@/types/portal";

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
    return portalSummary(customerId);
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
