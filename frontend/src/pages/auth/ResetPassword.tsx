import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PasswordRulesChecklist } from "@/components/auth/PasswordRulesChecklist";
import { isPasswordValid } from "@/lib/password";
import { authService } from "@/services/authService";
import type { ApiError } from "@/services/api";
import type { MessageResponse } from "@/types/auth";

/**
 * Forgot-password links (/reset-password) and invitation links (/accept-invite) share this page:
 * both let the user choose a password with a single-use token from their email.
 */
export default function ResetPassword({ invite = false }: { invite?: boolean }) {
  const token = useSearchParams()[0].get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  const mutation = useMutation<MessageResponse, ApiError>({
    mutationFn: () => authService.resetPassword({ token: token ?? "", new_password: password }),
    onSuccess: ({ message }) => navigate("/login", { replace: true, state: { message } }),
  });

  if (!token) {
    return (
      <AuthLayout title={invite ? "Invalid invitation link" : "Invalid reset link"} subtitle="This link is missing its token.">
        <InvalidLink invite={invite} />
      </AuthLayout>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!isPasswordValid(password)) next.password = "Password doesn't meet all the requirements below.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length === 0) mutation.mutate();
  }

  // A 400 means the token is invalid or expired — the form can't succeed, so offer a new link.
  const tokenRejected = mutation.isError && mutation.error.status === 400;
  const passwordsMatch = confirm.length > 0 && confirm === password;

  return (
    <AuthLayout
      title={invite ? "Welcome to SubscriptIQ" : "Set a new password"}
      subtitle={invite ? "You've been invited. Choose a password to activate your account." : "Choose a strong password you haven't used before."}
    >
      {tokenRejected ? (
        <div className="space-y-5">
          <Alert tone="error">{mutation.error.message}</Alert>
          <InvalidLink invite={invite} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}

          <div className="space-y-2.5">
            <TextField
              label="New password"
              revealable
              autoComplete="new-password"
              placeholder="Create a strong password"
              icon={<Lock />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              autoFocus
            />
            <PasswordRulesChecklist password={password} />
          </div>

          <TextField
            label="Confirm new password"
            revealable
            autoComplete="new-password"
            placeholder="Re-enter your password"
            icon={<Lock />}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
            hint={passwordsMatch ? <span className="text-xs font-medium text-success">Passwords match</span> : null}
          />

          <Button type="submit" block loading={mutation.isPending} className="mt-2">
            {mutation.isPending ? "Saving…" : invite ? "Activate my account" : "Reset password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

function InvalidLink({ invite = false }: { invite?: boolean }) {
  if (invite) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Invitation links expire after 48 hours and work once. Ask your admin to send a new invitation — or, if you already set
          your password, just log in.
        </p>
        <Link
          to="/login"
          className="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:brightness-110"
        >
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Reset links expire after 30 minutes and can only be used once.</p>
      <Link
        to="/forgot-password"
        className="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:brightness-110"
      >
        Request a new link
      </Link>
      <Link to="/login" className="block text-center text-sm font-medium text-muted hover:text-ink">
        Back to sign in
      </Link>
    </div>
  );
}
