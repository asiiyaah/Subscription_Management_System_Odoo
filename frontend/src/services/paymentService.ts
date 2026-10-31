import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockPayments } from "@/mocks/billing";
import type { Paginated } from "@/types/common";
import type { Invoice, RecordPaymentRequest } from "@/types/invoice";
import type { PaymentListQuery, PaymentRow, PaymentStats } from "@/types/payment";

// Endpoints are documented in frontend/docs/API_INVOICES_CONTRACT.md.

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const paymentService = {
  list(query: PaymentListQuery): Promise<Paginated<PaymentRow>> {
    return USE_MOCKS ? mockPayments.list(query) : request(() => api.get("/api/payments", { params: query }));
  },

  stats(): Promise<PaymentStats> {
    return USE_MOCKS ? mockPayments.stats() : request(() => api.get("/api/payments/summary"));
  },

  /** Records a payment and returns the updated invoice (status becomes "paid" when the balance reaches 0). */
  record(body: RecordPaymentRequest): Promise<Invoice> {
    return USE_MOCKS ? mockPayments.record(body) : request(() => api.post("/api/payments", body));
  },
};
