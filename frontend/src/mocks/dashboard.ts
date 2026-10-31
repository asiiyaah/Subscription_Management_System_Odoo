import type { DashboardGrowthPoint, DashboardRevenuePoint, DashboardSummary } from "@/types/dashboard";

/** Clearly illustrative dashboard-only aggregates; never used when APIs are enabled. */
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const pastMonth = (monthsAgo: number) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - monthsAgo);
  return monthKey(date);
};
const futureDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const mockDashboard = {
  summary: {
    total_customers: 24,
    active_subscriptions: 38,
    mrr: 284500,
    revenue_collected: 1268400,
    outstanding_amount: 74600,
    overdue_invoice_count: 4,
    subscription_status_breakdown: { draft: 5, quotation: 6, confirmed: 4, active: 38, paused: 3, closed: 7 },
  } satisfies DashboardSummary,
  revenue: [174500, 192000, 186300, 218700, 236400, 260500].map((revenue, index) => ({ period: pastMonth(5 - index), revenue })) satisfies DashboardRevenuePoint[],
  growth: [27, 29, 31, 33, 35, 38].map((subscriptions, index) => ({ month: pastMonth(5 - index), subscriptions })) satisfies DashboardGrowthPoint[],
  renewals: [
    { id: "00000000-0000-4000-9000-000000000001", subscription_number: "SUB-0001", customer_id: "1", end_date: futureDate(8) },
    { id: "00000000-0000-4000-9000-000000000007", subscription_number: "SUB-0007", customer_id: "7", end_date: futureDate(14) },
  ],
};
