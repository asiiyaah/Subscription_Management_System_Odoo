import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockPayments } from "@/mocks/billing";
import type { Invoice, RecordPaymentRequest } from "@/types/invoice";

export const paymentService = {
  /** Records a payment and returns the updated invoice (status becomes "paid" when the balance reaches 0). */
  async record(body: RecordPaymentRequest): Promise<Invoice> {
    if (USE_MOCKS) return mockPayments.record(body);
    try {
      return (await api.post<Invoice>("/api/payments", body)).data;
    } catch (error) {
      throw toApiError(error);
    }
  },
};
