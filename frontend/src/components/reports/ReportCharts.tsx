import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, formatMonth } from "@/lib/chartTheme";
import { formatCurrency, formatNumber } from "@/lib/format";

type ValueFormat = "currency" | "number";
const fmt = (value: number, format: ValueFormat) => (format === "currency" ? formatCurrency(value) : formatNumber(value));
const fmtAxis = (value: number, format: ValueFormat) =>
  format === "currency" ? formatCurrency(value, { compact: true }) : formatNumber(value);

/** Card frame for a chart: title, optional subtitle/legend, then the plot. */
export function ChartCard({ title, subtitle, legend, children }: { title: string; subtitle?: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {legend}
      </div>
      {children}
    </section>
  );
}

/** Legend chips: swatch carries identity, text stays in ink colours. */
export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: unknown; name?: unknown; value?: unknown; color?: string }>;
  label?: unknown;
  format: ValueFormat;
}

function ChartTooltip({ active, payload, label, format }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-bg/95 px-3 py-2 text-xs shadow-xl shadow-black/40">
      <p className="mb-1 font-semibold text-ink">{formatMonth(String(label))}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-sm" style={{ background: entry.color }} aria-hidden />
          {String(entry.name)}
          <span className="ml-auto pl-3 font-semibold text-ink tabular-nums">{fmt(Number(entry.value), format)}</span>
        </p>
      ))}
    </div>
  );
}

interface SeriesSpec {
  key: string;
  label: string;
  color: string;
}

/** Monthly bars for one or two series on one axis (same unit — never a dual axis). */
export function MonthlyBars({
  data,
  series,
  format = "currency",
  height = 260,
}: {
  data: Array<Record<string, number | string>>;
  series: SeriesSpec[];
  format?: ValueFormat;
  height?: number;
}) {
  return (
    <div style={{ height }} role="img" aria-label={`Monthly ${series.map((s) => s.label).join(" and ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fill: CHART.axisText, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => fmtAxis(v, format)}
            tick={{ fill: CHART.axisText, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip cursor={{ fill: CHART.cursor }} content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={label} format={format} />} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Horizontal ranked bars in plain HTML — one colour, label + value at each row.
 * Use for short categorical lists (plans, methods, statuses, aging buckets).
 */
export function RankedBars({
  rows,
  format = "currency",
  empty = "No data for these filters.",
}: {
  rows: Array<{ label: ReactNode; value: number; hint?: string; key: string }>;
  format?: ValueFormat;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.every((row) => row.value === 0)) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3.5">
      {rows.map((row) => (
        <li key={row.key} className="text-sm" title={`${fmt(row.value, format)}${row.hint ? ` · ${row.hint}` : ""}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{fmt(row.value, format)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${(row.value / max) * 100}%`, background: CHART.series1, minWidth: row.value > 0 ? 4 : 0 }}
            />
          </div>
          {row.hint && <p className="mt-1 text-xs text-muted">{row.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
