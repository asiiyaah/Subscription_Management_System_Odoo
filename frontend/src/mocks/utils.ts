// Helpers so every mock list behaves like the real paginated API.
import type { ListQuery, Paginated } from "@/types/common";

export const mockDelay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

const RESERVED = new Set(["page", "page_size", "search", "sort_by", "sort_dir"]);

/**
 * Search, filter, sort and page an in-memory array.
 * - `searchFields`: fields matched (case-insensitive) against `query.search`.
 * - Any other key in `query` is an exact-match filter on the field with the same name.
 */
export function paginate<T extends object>(
  rows: T[],
  query: ListQuery,
  searchFields: (keyof T)[] = [],
): Paginated<T> {
  let result = rows;

  const search = query.search?.toString().trim().toLowerCase();
  if (search) {
    result = result.filter((row) =>
      searchFields.some((field) => String(row[field] ?? "").toLowerCase().includes(search)),
    );
  }

  for (const [key, value] of Object.entries(query)) {
    if (RESERVED.has(key) || value === undefined || value === "") continue;
    result = result.filter((row) => String((row as Record<string, unknown>)[key]) === String(value));
  }

  if (query.sort_by) {
    const key = query.sort_by;
    const direction = query.sort_dir === "desc" ? -1 : 1;
    result = [...result].sort((a, b) => {
      const x = (a as Record<string, unknown>)[key];
      const y = (b as Record<string, unknown>)[key];
      if (typeof x === "number" && typeof y === "number") return (x - y) * direction;
      return String(x ?? "").localeCompare(String(y ?? "")) * direction;
    });
  }

  const start = (query.page - 1) * query.page_size;
  return {
    items: result.slice(start, start + query.page_size),
    total: result.length,
    page: query.page,
    page_size: query.page_size,
  };
}

/** YYYY-MM-DD in the user's time zone (toISOString() would shift local midnight to the previous day in India). */
export { toIsoDate as localIso } from "@/lib/format";
