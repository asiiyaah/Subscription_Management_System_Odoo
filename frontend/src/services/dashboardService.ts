import { api, toApiError, USE_MOCKS } from "@/services/api";
import { customerService } from "@/services/customerService";
import { invoiceService } from "@/services/invoiceService";
import { subscriptionService } from "@/services/subscriptionService";
import { mockDashboard } from "@/mocks/dashboard";
import type { DashboardGrowthPoint, DashboardRenewal, DashboardRevenuePoint, DashboardSummary } from "@/types/dashboard";
import type { InvoiceSummaryRow } from "@/types/invoice";
import type { Subscription } from "@/types/subscription";

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try { return (await call()).data; } catch (error) { throw toApiError(error); }
}

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function sixMonthRange() {
  const now = new Date();
  return { start_date: isoDate(new Date(now.getFullYear(), now.getMonth() - 5, 1)), end_date: isoDate(now) };
}

export const dashboardService = {
  async summary(): Promise<DashboardSummary> {
    if (USE_MOCKS) return mockDashboard.summary;
    const [raw, customers] = await Promise.all([
      request<Omit<DashboardSummary, "total_customers">>(() => api.get("/api/analytics/summary")),
      customerService.list({ page: 1, page_size: 1 }),
    ]);
    return { ...raw, total_customers: customers.total };
  },
  async revenue(): Promise<DashboardRevenuePoint[]> {
    if (USE_MOCKS) return mockDashboard.revenue;
    const range = sixMonthRange();
    const result = await request<{ items: DashboardRevenuePoint[] }>(() => api.get("/api/analytics/revenue-over-time", { params: range }));
    return result.items;
  },
  async growth(): Promise<DashboardGrowthPoint[] | null> {
    // There is no backend subscription growth aggregation. Display mock growth only in mock mode.
    return USE_MOCKS ? mockDashboard.growth : null;
  },
  async renewals(): Promise<DashboardRenewal[]> {
    if (USE_MOCKS) return mockDashboard.renewals;
    const result = await request<{ items: DashboardRenewal[] }>(() => api.get("/api/analytics/expiring-subscriptions", { params: { days: 30 } }));
    return result.items;
  },
  recentSubscriptions(): Promise<Subscription[]> {
    return subscriptionService.list({ page: 1, page_size: 5 }).then((page) => page.items);
  },
  recentInvoices(): Promise<InvoiceSummaryRow[]> {
    return invoiceService.list({ page: 1, page_size: 5, sort_by: "invoice_date", sort_dir: "desc" }).then((page) => page.items);
  },
};
