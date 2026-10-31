import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, SearchX } from "lucide-react";
import { DropdownMenu, type MenuAction } from "@/components/ui/DropdownMenu";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import type { ListControls } from "@/hooks/useListQuery";
import type { Paginated } from "@/types/common";
import { cn } from "@/lib/cn";

export interface Column<T> {
  /** Field name; also the `sort_by` value sent to the API when sortable. */
  key: string;
  header: string;
  /** Custom cell. Defaults to the raw field value. */
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  /** Current page from the API (undefined while the first load is pending). */
  data: Paginated<T> | undefined;
  isLoading: boolean;
  /** True while a new page loads over existing data — dims the table. */
  isFetching?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** State from useListQuery(): page, search, sort, filters. */
  list: ListControls;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** Items for the "⋯" menu at the end of each row. */
  rowActions?: (row: T) => MenuAction[];
  /** Set to false to hide the search box. */
  searchPlaceholder?: string | false;
  /** Extra filter controls shown next to the search box (e.g. a <Select>). */
  filters?: ReactNode;
  empty?: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode };
}

const PAGE_SIZES = [10, 25, 50];
const NON_FILTER_KEYS = new Set(["page", "page_size", "sort_by", "sort_dir"]);

export function DataTable<T>({
  columns,
  data,
  isLoading,
  isFetching = false,
  isError = false,
  errorMessage,
  onRetry,
  list,
  rowKey,
  onRowClick,
  rowActions,
  searchPlaceholder = "Search…",
  filters,
  empty = { title: "Nothing here yet" },
}: DataTableProps<T>) {
  const { query } = list;
  const hasActions = Boolean(rowActions);
  const columnCount = columns.length + (hasActions ? 1 : 0);
  const isFiltered = Object.entries(query).some(([key, value]) => !NON_FILTER_KEYS.has(key) && value);

  function toggleSort(key: string) {
    const nextDir = query.sort_by === key && query.sort_dir === "asc" ? "desc" : "asc";
    list.setSort(key, nextDir);
  }

  let body: ReactNode;
  if (isError) {
    body = <StateRow colSpan={columnCount}><ErrorState message={errorMessage} onRetry={onRetry} /></StateRow>;
  } else if (isLoading || !data) {
    body = Array.from({ length: Math.min(query.page_size, 8) }, (_, i) => (
      <tr key={i} className="border-t border-line/60">
        {Array.from({ length: columnCount }, (_, j) => (
          <td key={j} className="px-4 py-4">
            <Skeleton className="h-4 w-full max-w-36" />
          </td>
        ))}
      </tr>
    ));
  } else if (data.items.length === 0) {
    body = (
      <StateRow colSpan={columnCount}>
        {isFiltered ? (
          <EmptyState
            icon={<SearchX />}
            title="No results match your filters"
            description="Try a different search or clear the filters."
            action={
              <Button variant="secondary" size="sm" onClick={list.reset}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState {...empty} />
        )}
      </StateRow>
    );
  } else {
    body = data.items.map((row) => (
      <tr
        key={rowKey(row)}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onKeyDown={
          onRowClick
            ? (event) => {
                if (event.key === "Enter" && event.target === event.currentTarget) onRowClick(row);
              }
            : undefined
        }
        tabIndex={onRowClick ? 0 : undefined}
        className={cn(
          "border-t border-line/60 transition-colors",
          onRowClick && "cursor-pointer hover:bg-surface-2/50 focus-visible:bg-surface-2/50 focus-visible:outline-none",
        )}
      >
        {columns.map((column) => (
          <td
            key={column.key}
            className={cn("px-4 py-3.5 text-sm whitespace-nowrap", column.align === "right" && "text-right", column.className)}
          >
            {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "—")}
          </td>
        ))}
        {hasActions && (
          <td className="w-12 px-2 py-3.5 text-right" onClick={(event) => event.stopPropagation()}>
            <DropdownMenu actions={rowActions!(row)} />
          </td>
        )}
      </tr>
    ));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/70">
      {(searchPlaceholder !== false || filters) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3 sm:p-4">
          {searchPlaceholder !== false && (
            <label className="relative min-w-52 flex-1 sm:max-w-xs">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={list.searchInput}
                onChange={(event) => list.setSearchInput(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-xl border border-line bg-surface-2/60 pl-10 pr-3 text-sm placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20"
              />
            </label>
          )}
          {filters && <div className="flex flex-wrap items-center gap-3 [&_select]:h-10">{filters}</div>}
        </div>
      )}

      {/* `relative` keeps absolutely positioned children (e.g. sr-only labels) inside the scroll area */}
      <div className={cn("relative overflow-x-auto transition-opacity", isFetching && !isLoading && "opacity-60")}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-2/40">
              {columns.map((column) => {
                const sorted = query.sort_by === column.key ? query.sort_dir : undefined;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted whitespace-nowrap",
                      column.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          "inline-flex items-center gap-1.5 uppercase tracking-wider transition hover:text-ink",
                          sorted && "text-ink",
                        )}
                      >
                        {column.header}
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {hasActions && (
                <th scope="col" className="w-12">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>

      {data && data.total > 0 && !isError && <Pagination data={data} list={list} />}
    </div>
  );
}

function StateRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan}>{children}</td>
    </tr>
  );
}

function Pagination<T>({ data, list }: { data: Paginated<T>; list: ListControls }) {
  const pageCount = Math.max(1, Math.ceil(data.total / data.page_size));
  const from = (data.page - 1) * data.page_size + 1;
  const to = Math.min(data.page * data.page_size, data.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
      <div className="flex items-center gap-3">
        <span>
          <span className="font-medium text-ink">
            {from}–{to}
          </span>{" "}
          of <span className="font-medium text-ink">{data.total}</span>
        </span>
        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">Rows</span>
          <select
            value={data.page_size}
            onChange={(event) => list.setPageSize(Number(event.target.value))}
            aria-label="Rows per page"
            className="h-8 cursor-pointer rounded-lg border border-line bg-surface-2/60 px-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size} className="bg-surface">
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav aria-label="Pagination" className="flex items-center gap-1">
        <PageButton disabled={data.page <= 1} onClick={() => list.setPage(data.page - 1)} label="Previous page">
          <ChevronLeft className="size-4" />
        </PageButton>
        {pageNumbers(data.page, pageCount).map((page, index) =>
          page === "…" ? (
            <span key={`gap-${index}`} className="px-1.5">
              …
            </span>
          ) : (
            <PageButton
              key={page}
              current={page === data.page}
              onClick={() => list.setPage(page)}
              label={`Page ${page}`}
            >
              {page}
            </PageButton>
          ),
        )}
        <PageButton disabled={data.page >= pageCount} onClick={() => list.setPage(data.page + 1)} label="Next page">
          <ChevronRight className="size-4" />
        </PageButton>
      </nav>
    </div>
  );
}

function PageButton({
  children,
  onClick,
  label,
  disabled,
  current,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  current?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30",
        current
          ? "bg-gradient-to-r from-primary to-accent text-white"
          : "text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** 1 … 4 5 6 … 12 */
function pageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let page = start; page <= end; page++) pages.push(page);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}
