import { useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/common/StatusBadge";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { AiCellFormat, AiResultData } from "@/types/ai";

const COLLAPSED_ROWS = 6;

function formatCell(value: string | number | null, format: AiCellFormat = "text") {
  if (value === null || value === "") return <span className="text-muted/50">—</span>;
  switch (format) {
    case "currency":
      return formatCurrency(Number(value));
    case "number":
      return formatNumber(Number(value));
    case "date":
      return formatDate(String(value));
    case "status":
      return <StatusBadge status={String(value)} />;
    default:
      return String(value);
  }
}

/** Renders the structured part of an AI reply: a table, metric cards or a bar chart. */
export function ResultView({ data }: { data: AiResultData }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <h3 className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">{data.title}</h3>
      {data.kind === "table" && <ResultTable data={data} />}
      {data.kind === "metrics" && (
        <dl className="grid grid-cols-2 gap-px bg-line">
          {data.items.map((item) => (
            <div key={item.label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-muted">{item.label}</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums">
                {item.format === "currency" ? formatCurrency(item.value) : formatNumber(item.value)}
              </dd>
              {item.hint && <dd className="text-xs text-muted">{item.hint}</dd>}
            </div>
          ))}
        </dl>
      )}
      {data.kind === "bar_chart" && <BarChart data={data} />}
    </section>
  );
}

function ResultTable({ data }: { data: Extract<AiResultData, { kind: "table" }> }) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? data.rows : data.rows.slice(0, COLLAPSED_ROWS);
  const hidden = data.rows.length - rows.length;

  return (
    <>
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              {data.columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn("px-4 py-2 font-medium whitespace-nowrap", col.align === "right" ? "text-right" : "text-left")}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-line/60">
                {data.columns.map((col, j) => {
                  const content = formatCell(row[col.key], col.format);
                  const linkTo = j === 0 && data.link ? `${data.link.base}${row[data.link.key]}` : null;
                  return (
                    <td
                      key={col.key}
                      className={cn("px-4 py-2 whitespace-nowrap tabular-nums", col.align === "right" && "text-right")}
                    >
                      {linkTo ? (
                        <Link to={linkTo} className="font-semibold text-primary hover:underline">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(hidden > 0 || expanded) && data.rows.length > COLLAPSED_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-line px-4 py-2 text-xs font-semibold text-primary transition hover:bg-surface-2/50"
        >
          {expanded ? "Show fewer" : `Show all ${data.rows.length} rows`}
        </button>
      )}
    </>
  );
}

function BarChart({ data }: { data: Extract<AiResultData, { kind: "bar_chart" }> }) {
  const max = Math.max(1, ...data.bars.map((bar) => bar.value));
  const fmt = (v: number) => (data.format === "currency" ? formatCurrency(v) : formatNumber(v));
  return (
    <ul className="space-y-3 px-4 py-3">
      {data.bars.map((bar) => (
        <li key={bar.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{bar.label}</span>
            <span className="font-semibold tabular-nums">{fmt(bar.value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${(bar.value / max) * 100}%` }} />
          </div>
          {bar.hint && <p className="mt-0.5 text-xs text-muted">{bar.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
