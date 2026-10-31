import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockInvoices } from "@/mocks/billing";
import type { Paginated } from "@/types/common";
import type {
  DueInvoicePreview,
  GenerateInvoicesResult,
  Invoice,
  InvoiceListQuery,
  InvoiceStats,
  InvoiceSummaryRow,
} from "@/types/invoice";

// Endpoints are documented in frontend/docs/API_INVOICES_CONTRACT.md.

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const invoiceService = {
  list(query: InvoiceListQuery): Promise<Paginated<InvoiceSummaryRow>> {
    return USE_MOCKS ? mockInvoices.list(query) : request(() => api.get("/api/invoices", { params: query }));
  },

  stats(): Promise<InvoiceStats> {
    return USE_MOCKS ? mockInvoices.stats() : request(() => api.get("/api/invoices/summary"));
  },

  get(id: number): Promise<Invoice> {
    return USE_MOCKS ? mockInvoices.get(id) : request(() => api.get(`/api/invoices/${id}`));
  },

  confirm(id: number): Promise<Invoice> {
    return USE_MOCKS ? mockInvoices.confirm(id) : request(() => api.post(`/api/invoices/${id}/confirm`));
  },

  cancel(id: number): Promise<Invoice> {
    return USE_MOCKS ? mockInvoices.cancel(id) : request(() => api.post(`/api/invoices/${id}/cancel`));
  },

  send(id: number): Promise<{ message: string }> {
    return USE_MOCKS ? mockInvoices.send(id) : request(() => api.post(`/api/invoices/${id}/send`));
  },

  duePreview(): Promise<DueInvoicePreview[]> {
    return USE_MOCKS ? mockInvoices.duePreview() : request(() => api.get("/api/invoices/due-preview"));
  },

  generateDue(): Promise<GenerateInvoicesResult> {
    return USE_MOCKS ? mockInvoices.generateDue() : request(() => api.post("/api/invoices/generate-due"));
  },
};
