import { api, isLive, toApiError } from "@/services/api";
import { mockReports } from "@/mocks/reports";
import type { ProductOption } from "@/types/common";
import type { ReportData, ReportFilters } from "@/types/report";

// Contract: frontend/docs/API_REPORTS_CONTRACT.md — backend routers/reports.py (GET /api/reports).
const LIVE = isLive("reports");

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Fields where the backend's shape differs slightly from the UI's. */
type ApiReport = Omit<ReportData, "outstanding_by_month" | "payment_timing"> & {
  outstanding_by_month: Array<{ month: string; amount?: number; outstanding?: number }>;
  /** Backend sends only the average for now (no day buckets). */
  payment_timing: ReportData["payment_timing"] | { avg_days_to_pay: number | null };
};

function fromApi(raw: ApiReport): ReportData {
  return {
    ...raw,
    outstanding_by_month: raw.outstanding_by_month.map((m) => ({ month: m.month, outstanding: m.outstanding ?? m.amount ?? 0 })),
    payment_timing: Array.isArray(raw.payment_timing) ? raw.payment_timing : [],
    avg_days_to_pay: raw.avg_days_to_pay ?? null,
  };
}

export const reportService = {
  /** The backend returns the four contract-defined day buckets for live and mock data. */
  capabilities: { paymentTimingBuckets: true },

  async get(filters: ReportFilters): Promise<ReportData> {
    if (!LIVE) return mockReports.get(filters);
    return fromApi(await request<ApiReport>(() => api.get("/api/reports", { params: filters })));
  },

  /** Values for the Plan and Customer filter dropdowns. */
  options(): Promise<{ plans: string[]; customers: ProductOption[] }> {
    return LIVE ? request(() => api.get("/api/reports/options")) : mockReports.options();
  },
};
