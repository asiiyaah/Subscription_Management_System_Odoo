import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip, fmt, fmtAxis, type ValueFormat } from "@/components/reports/ReportCharts";
import { CHART, formatMonth } from "@/lib/chartTheme";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

const axisProps = {
  tick: { fill: CHART.axisText, fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;

interface LineSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Burn-up: running totals over months on one axis, 2px lines.
 * The vertical gap between the lines is what's still owed.
 */
export function CumulativeLines({
  data,
  series,
  height = 240,
}: {
  data: Array<Record<string, number | string>>;
  series: LineSeries[];
  height?: number;
}) {
  return (
    <div style={{ height }} role="img" aria-label={`Running totals: ${series.map((s) => s.label).join(" and ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonth} interval="preserveStartEnd" {...axisProps} />
          <YAxis tickFormatter={(v: number) => fmtAxis(v, "currency")} width={64} {...axisProps} />
          <Tooltip
            cursor={{ stroke: CHART.axisText, strokeWidth: 1 }}
            content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={label} format="currency" />}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: s.color, stroke: CHART.surface, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Burn-down: one series as a 2px line with a soft fill, so the downward trend reads at a glance. */
export function TrendArea({
  data,
  dataKey,
  label,
  height = 240,
}: {
  data: Array<Record<string, number | string>>;
  dataKey: string;
  label: string;
  height?: number;
}) {
  return (
    <div style={{ height }} role="img" aria-label={`${label} by month`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.series1} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART.series1} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonth} interval="preserveStartEnd" {...axisProps} />
          <YAxis tickFormatter={(v: number) => fmtAxis(v, "currency")} width={64} {...axisProps} />
          <Tooltip
            cursor={{ stroke: CHART.axisText, strokeWidth: 1 }}
            content={({ active, payload, label: x }) => <ChartTooltip active={active} payload={payload} label={x} format="currency" />}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={label}
            stroke={CHART.series1}
            strokeWidth={2}
            fill="url(#trend-fill)"
            activeDot={{ r: 5, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Part-to-whole donut — at most 3 slices (pink, blue, amber are validated as a set).
 * Callers fold anything beyond the top 2 into "Other". Legend lists value and share, so colour is never alone.
 */
export function Donut({
  slices,
  format,
  centerLabel,
}: {
  slices: Array<{ label: string; value: number }>;
  format: ValueFormat;
  centerLabel: string;
}) {
  const colors = [CHART.series1, CHART.series2, CHART.series3];
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <p className="py-10 text-center text-sm text-muted">No data for these filters.</p>;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative size-44 shrink-0" role="img" aria-label={`${centerLabel}: ${fmt(total, format)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="64%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke={CHART.surface}
              strokeWidth={2}
              cornerRadius={4}
              isAnimationActive={false}
            >
              {slices.map((slice, i) => (
                <Cell key={slice.label} fill={colors[i]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="rounded-xl border border-line bg-bg/95 px-3 py-2 text-xs shadow-xl shadow-black/40">
                    <p className="font-semibold text-ink">{String(payload[0].name)}</p>
                    <p className="text-muted">
                      {fmt(Number(payload[0].value), format)} · {Math.round((Number(payload[0].value) / total) * 100)}%
                    </p>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-extrabold tabular-nums">{fmt(total, format).replace(/\.00$/, "")}</span>
          <span className="text-[11px] text-muted">{centerLabel}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2.5 text-sm">
        {slices.map((slice, i) => (
          <li key={slice.label} className="flex items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colors[i] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{slice.label}</span>
            <span className="text-xs text-muted tabular-nums">{Math.round((slice.value / total) * 100)}%</span>
            <span className="w-24 text-right font-semibold tabular-nums">{fmt(slice.value, format)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Fold a list into at most `max` slices: the top (max − 1) plus "Other". */
export function foldToSlices<T>(rows: T[], label: (row: T) => string, value: (row: T) => number, max = 3) {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  if (sorted.length <= max) return sorted.map((row) => ({ label: label(row), value: value(row) }));
  const head = sorted.slice(0, max - 1).map((row) => ({ label: label(row), value: value(row) }));
  const rest = sorted.slice(max - 1).reduce((sum, row) => sum + value(row), 0);
  return [...head, { label: "Other", value: rest }];
}

/** A single headline percentage as a ring — e.g. collection rate. The number is the chart. */
export function RingGauge({ percent, label, caption }: { percent: number | null; label: string; caption: string }) {
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent));

  return (
    <div className="flex flex-col items-center text-center">
      <svg viewBox="0 0 160 160" className="size-40" role="img" aria-label={`${label}: ${percent === null ? "no data" : `${clamped}%`}`}>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#3a1657" strokeWidth="14" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={CHART.series1}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
          transform="rotate(-90 80 80)"
          className="transition-[stroke-dasharray] duration-700"
        />
        <text x="80" y="80" textAnchor="middle" dominantBaseline="central" className="fill-ink text-[28px] font-extrabold">
          {percent === null ? "—" : `${clamped}%`}
        </text>
      </svg>
      <p className="mt-2 font-semibold">{label}</p>
      <p className="mt-0.5 max-w-56 text-xs text-muted">{caption}</p>
    </div>
  );
}

/**
 * Funnel of ordered stages: bar width = share of the first stage, colour steps along the ordinal ramp,
 * and the conversion from the previous stage is written between rows.
 */
export function Funnel({ stages }: { stages: Array<{ label: string; value: number; hint?: string }> }) {
  const top = Math.max(1, stages[0]?.value ?? 1);
  return (
    <ol className="space-y-1">
      {stages.map((stage, i) => {
        const prev = stages[i - 1]?.value;
        const conversion = prev ? Math.round((stage.value / prev) * 100) : null;
        return (
          <li key={stage.label}>
            {conversion !== null && (
              <p className="py-1 pl-3 text-[11px] text-muted" aria-label={`${conversion}% continue to ${stage.label}`}>
                ↓ {conversion}%
              </p>
            )}
            <div className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-muted">{stage.label}</span>
              <div className="h-7 flex-1 overflow-hidden rounded-lg bg-surface-2/60">
                <div
                  className="flex h-full items-center justify-end rounded-lg pr-2 text-xs font-semibold text-white"
                  style={{ width: `${Math.max(8, (stage.value / top) * 100)}%`, background: CHART.ordinal[i] ?? CHART.series1 }}
                >
                  {formatNumber(stage.value)}
                </div>
              </div>
            </div>
            {stage.hint && <p className="mt-0.5 pl-31 text-xs text-muted">{stage.hint}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** Vertical histogram over ordered buckets (e.g. days to pay), stepped along the ordinal ramp. */
export function Histogram({
  data,
  format = "number",
  height = 220,
  className,
}: {
  data: Array<{ bucket: string; value: number }>;
  format?: ValueFormat;
  height?: number;
  className?: string;
}) {
  return (
    <div style={{ height }} className={cn(className)} role="img" aria-label="Distribution by bucket">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="22%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="bucket" {...axisProps} />
          <YAxis allowDecimals={false} tickFormatter={(v: number) => fmtAxis(v, format)} width={40} {...axisProps} />
          <Tooltip
            cursor={{ fill: CHART.cursor }}
            content={({ active, payload, label }) => (
              <ChartTooltip active={active} payload={payload} label={label} format={format} labelFormat={(l) => l} />
            )}
          />
          <Bar dataKey="value" name="Payments" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {data.map((row, i) => (
              <Cell key={row.bucket} fill={CHART.ordinal[i] ?? CHART.series1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
