import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Lock, Mail } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { homePathFor, useAuth } from "@/context/AuthContext";
import { EMAIL_PATTERN } from "@/lib/password";
import { USE_MOCKS } from "@/services/api";
import type { ApiError } from "@/services/api";

interface LocationState {
  from?: string;
  message?: string;
  email?: string;
}

const DEMO_ACCOUNTS = [
  { role: "Admin", email: "admin@subscriptiq.com", password: "Admin@1234" },
  { role: "Staff", email: "staff@subscriptiq.com", password: "Staff@1234" },
  { role: "Customer", email: "customer@acmeretail.in", password: "Customer@1234" },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as LocationState;

  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const mutation = useMutation<Awaited<ReturnType<typeof login>>, ApiError>({
    mutationFn: () => login({ email: email.trim(), password }, remember),
    onSuccess: (loggedIn) => {
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
        {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}

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

      {USE_MOCKS && (
        <div className="mt-7 border-t border-line pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Demo accounts</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.role}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                  setErrors({});
                  mutation.reset();
                }}
                className="rounded-lg border border-line bg-surface-2/50 px-2 py-2 text-xs font-medium text-ink transition hover:border-primary/60 hover:bg-surface-2"
              >
                {account.role}
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
