import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Lock, Mail } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { homePathFor, useAuth } from "@/context/AuthContext";
import { EMAIL_PATTERN } from "@/lib/password";
import type { ApiError } from "@/services/api";

interface LocationState {
  from?: string;
  message?: string;
  email?: string;
}

/**
 * Demo accounts panel: lists demo **email addresses only** — passwords are never stored or shown here;
 * whoever runs the demo types them. Configure in .env:
 *   VITE_DEMO_ACCOUNTS=Admin:admin@subscriptiq.com,Staff:staff@subscriptiq.com,Customer:customer@acmeretail.in
 *   VITE_DEMO_ACCOUNTS=off   → hide the panel (real launch)
 * If unset, local development shows the mock accounts and production builds show nothing.
 */
const DEFAULT_DEMO = "Admin:admin@subscriptiq.com,Staff:staff@subscriptiq.com,Customer:customer@acmeretail.in";
const DEMO_SETTING: string = String(import.meta.env.VITE_DEMO_ACCOUNTS ?? (import.meta.env.DEV ? DEFAULT_DEMO : "")).trim();
const DEMO_ACCOUNTS: Array<{ role: string; email: string }> =
  DEMO_SETTING === "off"
    ? []
    : DEMO_SETTING.split(",")
        .map((entry: string) => entry.split(":").map((part: string) => part.trim()))
        .filter(([role, email]) => role && email)
        .map(([role, email]) => ({ role, email }));

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as LocationState;

  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const mutation = useMutation<Awaited<ReturnType<typeof login>>, ApiError>({
    mutationFn: () => login({ email: email.trim(), password }, remember),
    onSuccess: (loggedIn) => {
      // Temporary password from an admin: choose your own before anything else.
      if (loggedIn.must_change_password) {
        navigate("/set-password", { replace: true });
        return;
      }
      const target = state.from && loggedIn.role !== "customer" ? state.from : homePathFor(loggedIn.role);
      navigate(target, { replace: true });
    },
  });

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length === 0) mutation.mutate();
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New to SubscriptIQ?{" "}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {state.message && !mutation.isError && <Alert tone="success">{state.message}</Alert>}
        {mutation.isError && (
          <Alert tone="error">
            <p>{mutation.error.message}</p>
            {/* Backend REQUIRE_EMAIL_VERIFICATION: offer a fresh confirmation link. */}
            {mutation.error.status === 403 && /confirm your email/i.test(mutation.error.message) && (
              <ResendVerification email={email.trim()} />
            )}
          </Alert>
        )}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          icon={<Mail />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoFocus
        />

        <TextField
          ref={passwordRef}
          label="Password"
          revealable
          autoComplete="current-password"
          placeholder="Enter your password"
          icon={<Lock />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={
            <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
              Forgot password?
            </Link>
          }
        />

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 rounded border-line accent-primary"
          />
          Keep me signed in
        </label>

        <Button type="submit" block loading={mutation.isPending}>
          {mutation.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {DEMO_ACCOUNTS.length > 0 && (
        <div className="mt-7 border-t border-line pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Demo accounts</p>
          <p className="mt-1 text-xs text-muted">Pick one to fill in the email, then type its password.</p>
          <ul className="mt-3 space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword("");
                    setErrors({});
                    mutation.reset();
                    passwordRef.current?.focus();
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 text-left text-sm transition hover:border-primary/60 hover:bg-surface-2"
                >
                  <span className="font-medium text-ink">{account.role}</span>
                  <span className="truncate text-xs text-muted">{account.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AuthLayout>
  );
}
