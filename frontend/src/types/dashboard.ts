import type { Id } from "@/types/common";
import type { SubscriptionStatus } from "@/types/subscription";

export interface DashboardSummary {
  total_customers: number;
  active_subscriptions: number;
  mrr: number | string;
  revenue_collected: number | string;
  outstanding_amount: number | string;
  overdue_invoice_count: number;
  subscription_status_breakdown: Partial<Record<SubscriptionStatus, number>>;
}

export interface DashboardRevenuePoint {
  period: string;
  revenue: number | string;
}

export interface DashboardRenewal {
  id: Id;
  subscription_number: string;
  customer_id: Id;
  end_date: string;
}

export interface DashboardGrowthPoint {
  month: string;
  subscriptions: number;
}
