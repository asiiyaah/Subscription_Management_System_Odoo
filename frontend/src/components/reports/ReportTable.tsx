import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ReportColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Plain value for CSV export. */
  csv: (row: T) => string | number;
}

const COLLAPSED = 10;

/** Static table for report data (already filtered by the API). Shows 10 rows, then "Show all". */
export function ReportTable<T>({
  title,
  subtitle,
  columns,
  rows,
  rowKey,
  empty = "Nothing to show for these filters.",
}: {
  title: string;
  subtitle?: string;
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p>
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2/40 text-xs uppercase tracking-wider text-muted">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className={cn("px-5 py-2.5 font-semibold whitespace-nowrap", col.align === "right" ? "text-right" : "text-left")}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={rowKey(row)} className="border-t border-line/60">
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-5 py-3 whitespace-nowrap tabular-nums", col.align === "right" && "text-right")}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-line px-5 py-2.5 text-xs font-semibold text-primary transition hover:bg-surface-2/50"
            >
              {expanded ? "Show fewer" : `Show all ${rows.length} rows`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Download rows as a CSV file (opens in Excel / Google Sheets). */
export function downloadCsv<T>(filename: string, columns: ReportColumn<T>[], rows: T[]) {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escape(c.label)), ...rows.map((row) => columns.map((c) => escape(c.csv(row))))];
  // BOM so Excel reads ₹ and other UTF-8 characters correctly.
  const blob = new Blob(["﻿" + lines.map((line) => line.join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
