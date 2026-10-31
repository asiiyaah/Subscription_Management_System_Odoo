import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockPortal } from "@/mocks/portal";
import type { Paginated } from "@/types/common";
import type { Invoice, InvoiceListQuery, InvoiceSummaryRow } from "@/types/invoice";
import type { PortalSummary } from "@/types/portal";

/** Customer portal (R6): every endpoint returns only the signed-in customer's own data. */

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const portalService = {
  summary(): Promise<PortalSummary> {
    return USE_MOCKS ? mockPortal.summary() : request(() => api.get("/api/portal/summary"));
  },
  /** Extra filter: `unpaid=true`. Drafts are never returned. */
  invoices(query: InvoiceListQuery & { unpaid?: "true" }): Promise<Paginated<InvoiceSummaryRow>> {
    return USE_MOCKS ? mockPortal.invoices(query) : request(() => api.get("/api/portal/invoices", { params: query }));
  },
  invoice(id: number): Promise<Invoice> {
    return USE_MOCKS ? mockPortal.invoice(id) : request(() => api.get(`/api/portal/invoices/${id}`));
  },
};
