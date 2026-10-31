import { api, isLive, toApiError } from "@/services/api";
import { mockAuth } from "@/mocks/auth";
import type {
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  MessageResponse,
  ResetPasswordRequest,
  SignupRequest,
  SignupResponse,
} from "@/types/auth";

// Endpoints are documented in frontend/docs/API_AUTH_CONTRACT.md. The backend matches it exactly.
const USE_MOCK = !isLive("auth");

async function post<TReq, TRes>(url: string, body: TReq): Promise<TRes> {
  try {
    const { data } = await api.post<TRes>(url, body);
    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const authService = {
  login(body: LoginRequest): Promise<LoginResponse> {
    return USE_MOCK ? mockAuth.login(body) : post("/api/auth/login", body);
  },

  signup(body: SignupRequest): Promise<SignupResponse> {
    return USE_MOCK ? mockAuth.signup(body) : post("/api/auth/signup", body);
  },

  forgotPassword(body: ForgotPasswordRequest): Promise<MessageResponse> {
    return USE_MOCK ? mockAuth.forgotPassword(body) : post("/api/auth/forgot-password", body);
  },

  /** Also used for invitation links (first password). */
  resetPassword(body: ResetPasswordRequest): Promise<MessageResponse> {
    return USE_MOCK ? mockAuth.resetPassword(body) : post("/api/auth/reset-password", body);
  },

  verifyEmail(token: string): Promise<MessageResponse> {
    return USE_MOCK ? mockAuth.verifyEmail() : post("/api/auth/verify-email", { token });
  },

  resendVerification(email: string): Promise<MessageResponse> {
    return USE_MOCK ? mockAuth.resendVerification() : post("/api/auth/resend-verification", { email });
  },
};
