export type Role = "admin" | "staff" | "customer";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
  company?: string;
}

export interface SignupResponse {
  user: User;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface MessageResponse {
  message: string;
  /** Mock mode only: lets us open the reset page without real email. */
  dev_reset_link?: string;
}
