import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ListQuery, SortDirection } from "@/types/common";

type Changes = Record<string, string | number | undefined>;

interface Options {
  pageSize?: number;
  sortBy?: string;
  sortDir?: SortDirection;
  /**
   * Keep state in the URL (default). Set false for tables embedded in another page
   * (e.g. invoices on a customer page) so they don't fight over the URL.
   */
  inUrl?: boolean;
}

/**
 * List page state (page, page size, search, sort, filters), kept in the URL by default
 * so filters survive refresh and links like `/invoices?status=paid` work.
 *
 *   const list = useListQuery({ sortBy: "created_at", sortDir: "desc" });
 *   useQuery({ queryKey: ["invoices", list.query], queryFn: () => invoiceService.list(list.query) });
 *   <DataTable list={list} ... />
 */
export function useListQuery({ pageSize = 10, sortBy, sortDir = "asc", inUrl = true }: Options = {}) {
  const [urlParams, setUrlParams] = useSearchParams();
  const [localParams, setLocalParams] = useState(() => new URLSearchParams());
  const params = inUrl ? urlParams : localParams;

  const setParams = useCallback(
    (updater: (prev: URLSearchParams) => URLSearchParams) => {
      if (inUrl) setUrlParams(updater, { replace: true });
      else setLocalParams(updater);
    },
    [inUrl, setUrlParams],
  );

  const query = useMemo<ListQuery>(() => {
    const result: ListQuery = {
      page: Math.max(1, Number(params.get("page")) || 1),
      page_size: Number(params.get("page_size")) || pageSize,
      sort_by: sortBy,
      sort_dir: sortBy ? sortDir : undefined,
    };
    params.forEach((value, key) => {
      if (key !== "page" && key !== "page_size") result[key] = value;
    });
    return result;
  }, [params, pageSize, sortBy, sortDir]);

  /** Apply changes; any change other than `page` sends you back to page 1. */
  const update = useCallback(
    (changes: Changes) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined || value === "") next.delete(key);
          else next.set(key, String(value));
        }
        if (!("page" in changes)) next.delete("page");
        return next;
      });
    },
    [setParams],
  );

  // The search box updates instantly; the query (and the API call) follows 300 ms after typing stops.
  const currentSearch = params.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(currentSearch);
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === currentSearch) return;
    const timer = setTimeout(() => update({ search: trimmed || undefined }), 300);
    return () => clearTimeout(timer);
  }, [searchInput, currentSearch, update]);

  return {
    query,
    searchInput,
    setSearchInput,
    setPage: (page: number) => update({ page }),
    setPageSize: (size: number) => update({ page_size: size }),
    setSort: (key: string, dir: SortDirection) => update({ sort_by: key, sort_dir: dir }),
    setFilter: (key: string, value: string | number | undefined) => update({ [key]: value }),
    /** Change several filters at once, e.g. switching tabs: setFilters({ status: undefined, overdue: "true" }). */
    setFilters: (changes: Changes) => update(changes),
    reset: () => {
      setSearchInput("");
      setParams(() => new URLSearchParams());
    },
  };
}

export type ListControls = ReturnType<typeof useListQuery>;
