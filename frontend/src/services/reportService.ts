import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockReports } from "@/mocks/reports";
import type { ProductOption } from "@/types/common";
import type { ReportData, ReportFilters } from "@/types/report";

// Endpoints are documented in frontend/docs/API_REPORTS_CONTRACT.md.

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const reportService = {
  get(filters: ReportFilters): Promise<ReportData> {
    return USE_MOCKS ? mockReports.get(filters) : request(() => api.get("/api/reports", { params: filters }));
  },

  /** Values for the Plan and Customer filter dropdowns. */
  options(): Promise<{ plans: string[]; customers: ProductOption[] }> {
    return USE_MOCKS ? mockReports.options() : request(() => api.get("/api/reports/options"));
  },
};
