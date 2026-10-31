import { api, isLive, toApiError } from "@/services/api";
import { mockPayments } from "@/mocks/billing";
import { normalizeInvoice } from "@/services/invoiceService";
import type { Paginated } from "@/types/common";
import type { Invoice, RecordPaymentRequest } from "@/types/invoice";
import type { PaymentListQuery, PaymentRow, PaymentStats } from "@/types/payment";

// Contract: frontend/docs/API_INVOICES_CONTRACT.md — matches backend routers/payments.py.
const LIVE = isLive("payments");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const paymentService = {
  async list(query: PaymentListQuery): Promise<Paginated<PaymentRow>> {
    if (!LIVE) return mockPayments.list(query);
    const { search, ...rest } = query;
    const page = await request<Paginated<PaymentRow>>(() => api.get("/api/payments", { params: { ...rest, q: search || undefined } }));
    return { ...page, items: page.items.map((row) => ({ ...row, note: row.note ?? undefined })) };
  },

  stats(): Promise<PaymentStats> {
    return LIVE ? request(() => api.get("/api/payments/summary")) : mockPayments.stats();
  },

  /** Records a payment and returns the updated invoice (status becomes "paid" when the balance reaches 0). */
  async record(body: RecordPaymentRequest): Promise<Invoice> {
    if (!LIVE) return mockPayments.record(body);
    return normalizeInvoice(await request<Invoice>(() => api.post("/api/payments", body)));
  },
};
