import axios, { AxiosError } from "axios";
import { tokenStorage } from "@/lib/tokenStorage";

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

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
          ? String(detail[0].msg)
          : "Something went wrong. Please try again.";
    return new ApiError(error.response.status, message);
  }
  return new ApiError(500, "Something went wrong. Please try again.");
}
