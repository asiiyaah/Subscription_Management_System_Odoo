// In-browser stand-in for the auth API until the backend is ready.
// Users and reset tokens are kept in localStorage so sign-up → login works across reloads.
import { ApiError } from "@/services/api";
import type {
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  MessageResponse,
  ResetPasswordRequest,
  SignupRequest,
  SignupResponse,
  User,
} from "@/types/auth";

export interface MockUser extends User {
  password: string;
  /** false = disabled by an admin; can't log in. Missing = true. */
  active?: boolean;
  last_login?: string | null;
  created_at?: string;
}

const USERS_KEY = "subscriptiq.mock.users";
const RESET_KEY = "subscriptiq.mock.resetTokens";
const RESET_TTL_MS = 30 * 60 * 1000;

const SEED_USERS: MockUser[] = [
  { id: 1, name: "Admin", email: "admin@subscriptiq.com", role: "admin", password: "Admin@1234" },
  { id: 2, name: "Riya Staff", email: "staff@subscriptiq.com", role: "staff", password: "Staff@1234" },
  { id: 3, name: "Acme Retail", email: "customer@acmeretail.in", role: "customer", password: "Customer@1234" },
];

const delay = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

export function loadUsers(): MockUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? (JSON.parse(raw) as MockUser[]) : [...SEED_USERS];
}

export function saveUsers(users: MockUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadResetTokens(): Record<string, { email: string; expires: number }> {
  return JSON.parse(localStorage.getItem(RESET_KEY) ?? "{}");
}

function publicUser({ id, name, email, role }: MockUser): User {
  return { id, name, email, role };
}

export const mockAuth = {
  async login({ email, password }: LoginRequest): Promise<LoginResponse> {
    await delay();
    const user = loadUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== password) {
      throw new ApiError(401, "Incorrect email or password.");
    }
    if (user.active === false) {
      throw new ApiError(403, "This account has been disabled. Contact your admin.");
    }
    saveUsers(loadUsers().map((u) => (u.id === user.id ? { ...u, last_login: new Date().toISOString() } : u)));
    return { access_token: `mock-token-${user.id}`, token_type: "bearer", user: publicUser(user) };
  },

  async signup(data: SignupRequest): Promise<SignupResponse> {
    await delay();
    const users = loadUsers();
    if (users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
      throw new ApiError(409, "An account with this email already exists.");
    }
    const user: MockUser = {
      id: Math.max(...users.map((u) => u.id)) + 1,
      name: data.name,
      email: data.email,
      role: "customer",
      password: data.password,
    };
    saveUsers([...users, user]);
    return { user: publicUser(user) };
  },

  async forgotPassword({ email }: ForgotPasswordRequest): Promise<MessageResponse> {
    await delay();
    const message = "If this email is registered, a password reset link has been sent to it.";
    const exists = loadUsers().some((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!exists) return { message };

    const token = crypto.randomUUID();
    const tokens = loadResetTokens();
    tokens[token] = { email, expires: Date.now() + RESET_TTL_MS };
    localStorage.setItem(RESET_KEY, JSON.stringify(tokens));
    return { message, dev_reset_link: `/reset-password?token=${token}` };
  },

  async resetPassword({ token, new_password }: ResetPasswordRequest): Promise<MessageResponse> {
    await delay();
    const tokens = loadResetTokens();
    const entry = tokens[token];
    if (!entry || entry.expires < Date.now()) {
      throw new ApiError(400, "This reset link is invalid or has expired.");
    }
    const users = loadUsers().map((u) =>
      u.email.toLowerCase() === entry.email.toLowerCase() ? { ...u, password: new_password } : u,
    );
    saveUsers(users);
    delete tokens[token];
    localStorage.setItem(RESET_KEY, JSON.stringify(tokens));
    return { message: "Your password has been reset. You can now log in." };
  },
};
