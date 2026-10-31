import { api, isLive, num, toApiError } from "@/services/api";
import { mockInvoices } from "@/mocks/billing";
import type { Id, Paginated } from "@/types/common";
import type {
  DueInvoicePreview,
  GenerateInvoicesResult,
  Invoice,
  InvoiceListQuery,
  InvoiceStats,
  InvoiceSummaryRow,
} from "@/types/invoice";

// Contract: frontend/docs/API_INVOICES_CONTRACT.md — the backend (routers/invoices.py) now returns this shape.
const LIVE = isLive("invoices");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Backend sends `null` where the UI uses "not set". */
export function normalizeInvoice<T extends InvoiceSummaryRow>(raw: T): T {
  const inv = raw as T & Partial<Invoice>;
  return {
    ...inv,
    subscription_number: inv.subscription_number ?? "",
    ...(inv.lines && {
      discount: inv.discount ?? undefined,
      customer_address: inv.customer_address ?? undefined,
      sent_at: inv.sent_at ?? undefined,
      period_end: inv.period_end ?? "",
      payment_terms: inv.payment_terms ?? "",
      lines: inv.lines.map((line) => ({ ...line, tax_label: line.tax_label ?? undefined })),
      payments: (inv.payments ?? []).map((p) => ({ ...p, note: p.note ?? undefined })),
    }),
  };
}

/** UI list params → backend params (`search` is called `q` there). */
function toParams(query: InvoiceListQuery) {
  const { search, ...rest } = query;
  return { ...rest, q: search || undefined };
}

export const invoiceService = {
  async list(query: InvoiceListQuery): Promise<Paginated<InvoiceSummaryRow>> {
    if (!LIVE) return mockInvoices.list(query);
    const page = await request<Paginated<InvoiceSummaryRow>>(() => api.get("/api/invoices", { params: toParams(query) }));
    return { ...page, items: page.items.map(normalizeInvoice) };
  },

  stats(): Promise<InvoiceStats> {
    return LIVE ? request(() => api.get("/api/invoices/summary")) : mockInvoices.stats();
  },

  async get(id: Id): Promise<Invoice> {
    if (!LIVE) return mockInvoices.get(id);
    return normalizeInvoice(await request<Invoice>(() => api.get(`/api/invoices/${id}`)));
  },

  async confirm(id: Id): Promise<Invoice> {
    if (!LIVE) return mockInvoices.confirm(id);
    return normalizeInvoice(await request<Invoice>(() => api.post(`/api/invoices/${id}/confirm`)));
  },

  async cancel(id: Id): Promise<Invoice> {
    if (!LIVE) return mockInvoices.cancel(id);
    return normalizeInvoice(await request<Invoice>(() => api.post(`/api/invoices/${id}/cancel`)));
  },

  send(id: Id): Promise<{ message: string }> {
    return LIVE ? request(() => api.post(`/api/invoices/${id}/send`)) : mockInvoices.send(id);
  },

  async duePreview(): Promise<DueInvoicePreview[]> {
    if (!LIVE) return mockInvoices.duePreview();
    const rows = await request<Array<DueInvoicePreview & { estimated_total: string | number }>>(() =>
      api.get("/api/invoices/due-preview"),
    );
    return rows.map((row) => ({
      ...row,
      estimated_total: num(row.estimated_total),
      period_end: row.period_end ?? "",
      skip_reason: row.skip_reason ?? undefined,
    }));
  },

  generateDue(): Promise<GenerateInvoicesResult> {
    return LIVE ? request(() => api.post("/api/invoices/generate-due")) : mockInvoices.generateDue();
  },
};
