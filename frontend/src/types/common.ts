/** Every list endpoint returns one page of results in this shape. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type SortDirection = "asc" | "desc";

/**
 * Query params every list endpoint accepts. Module-specific filters
 * (e.g. `status`, `customer_id`) go in as extra keys.
 */
export interface ListQuery {
  page: number;
  page_size: number;
  search?: string;
  sort_by?: string;
  sort_dir?: SortDirection;
  [filter: string]: string | number | undefined;
}

/** Minimal product reference for pickers (discount and tax rules). */
export interface ProductOption {
  id: number;
  name: string;
}
