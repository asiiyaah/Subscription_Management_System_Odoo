import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, ChartTooltip, MonthlyBars } from "@/components/reports/ReportCharts";
import { CHART, formatMonth } from "@/lib/chartTheme";
import type { DashboardGrowthPoint, DashboardRevenuePoint } from "@/types/dashboard";
import { num } from "@/services/api";

export function RevenueChart({ data, mock }: { data: DashboardRevenuePoint[]; mock: boolean }) {
  const rows = data.map((row) => ({ month: row.period, collected: num(row.revenue) }));
  return <ChartCard title="Revenue trends" subtitle={mock ? "Illustrative mock activity · collected payments" : "Backend-reported completed payments"}>
    {rows.length ? <MonthlyBars data={rows} series={[{ key: "collected", label: "Collected", color: CHART.series1 }]} /> : <p className="py-10 text-center text-sm text-muted">No revenue activity in this period.</p>}
  </ChartCard>;
}

export function SubscriptionGrowthChart({ data, mock }: { data: DashboardGrowthPoint[] | null; mock: boolean }) {
  return <ChartCard title="Subscription growth" subtitle={mock ? "Illustrative mock data · active total by month" : "Unavailable: the backend has no subscription growth aggregation endpoint."}>
    {data ? <div className="h-[260px]" role="img" aria-label="Subscription growth over time"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
      <CartesianGrid vertical={false} stroke={CHART.grid} />
      <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fill: CHART.axisText, fontSize: 11 }} axisLine={false} tickLine={false} />
      <YAxis allowDecimals={false} width={40} tick={{ fill: CHART.axisText, fontSize: 11 }} axisLine={false} tickLine={false} />
      <Tooltip cursor={{ stroke: CHART.axisText }} content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={label} format="number" />} />
      <Line type="monotone" dataKey="subscriptions" name="Subscriptions" stroke={CHART.series2} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
    </LineChart></ResponsiveContainer></div> : <p className="py-10 text-center text-sm text-muted">Growth trend is not provided by the live API.</p>}
  </ChartCard>;
}
