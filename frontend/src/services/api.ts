import axios, { AxiosError } from "axios";
import { tokenStorage } from "@/lib/tokenStorage";

/** Global switch (all modules, both members). Member 1's services read this directly. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

/**
 * Member 2's modules can go live one at a time while everything else stays on mocks:
 *   VITE_LIVE_APIS=taxes,discounts,users,settings,lookups,invoices,payments,reports,portal,ai
 * Any live module needs a real login token, so listing anything also makes `auth` and `account` live.
 */
const LIVE_APIS = new Set(
  (import.meta.env.VITE_LIVE_APIS ?? "")
    .split(",")
    .map((name: string) => name.trim())
    .filter(Boolean),
);
if (LIVE_APIS.size > 0) {
  LIVE_APIS.add("auth");
  LIVE_APIS.add("account");
}

export type LiveModule =
  | "auth"
  | "account"
  | "taxes"
  | "discounts"
  | "users"
  | "settings"
  | "lookups"
  | "invoices"
  | "payments"
  | "reports"
  | "portal"
  | "ai";

/** True when this module should call the real backend instead of its mock. */
export function isLive(module: LiveModule): boolean {
  return !USE_MOCKS || LIVE_APIS.has(module);
}

/** The backend sends money and quantities as decimal strings ("1179.82"); convert for display. */
export function num(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Expired or invalid session: clear it and send the user to login.
    const isAuthCall = error.config?.url?.startsWith("/api/auth/");
    if (error.response?.status === 401 && !isAuthCall) {
      tokenStorage.clear();
      window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);

/** Error with an HTTP status, thrown by both the real API and the mocks. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Turn an axios / FastAPI error into a readable message. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return new ApiError(0, "Can't reach the server. Check your connection and try again.");
    }
    const detail = (error.response.data as { detail?: unknown })?.detail;
    // FastAPI validation errors come back as a list of { msg }.
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail) && detail[0]?.msg
          ? String(detail[0].msg).replace(/^Value error, /, "")
          : "Something went wrong. Please try again.";
    return new ApiError(error.response.status, message);
  }
  return new ApiError(500, "Something went wrong. Please try again.");
}
