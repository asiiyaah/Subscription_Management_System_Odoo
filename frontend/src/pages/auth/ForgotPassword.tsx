import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Mail, MailCheck } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { EMAIL_PATTERN } from "@/lib/password";
import { authService } from "@/services/authService";
import type { ApiError } from "@/services/api";
import type { MessageResponse } from "@/types/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();

  const mutation = useMutation<MessageResponse, ApiError>({
    mutationFn: () => authService.forgotPassword({ email: email.trim() }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError(undefined);
    mutation.mutate();
  }

  if (mutation.isSuccess) {
    return (
      <AuthLayout title="Check your email" subtitle={`We sent instructions to ${email.trim()}.`}>
        <div className="space-y-5">
          <div className="flex justify-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-primary/40">
              <MailCheck className="size-8 text-primary" aria-hidden />
            </span>
          </div>
          <Alert tone="success">{mutation.data.message}</Alert>
          <p className="text-sm text-muted">
            The link expires in 30 minutes. Didn't get it? Check your spam folder or{" "}
            <button
              type="button"
              onClick={() => mutation.mutate()}
              className="font-semibold text-primary hover:underline"
            >
              send it again
            </button>
            .
          </p>

          {mutation.data.dev_reset_link && (
            <Alert tone="info">
              <p className="font-semibold">Demo mode — no email is sent</p>
              <Link to={mutation.data.dev_reset_link} className="font-semibold text-primary hover:underline">
                Open the reset link →
              </Link>
            </Alert>
          )}

          <BackToLogin />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter the email you registered with and we'll send you a link to reset it."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          icon={<Mail />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          autoFocus
        />

        <Button type="submit" block loading={mutation.isPending}>
          {mutation.isPending ? "Sending link…" : "Send reset link"}
        </Button>

        <BackToLogin />
      </form>
    </AuthLayout>
  );
}

function BackToLogin() {
  return (
    <Link
      to="/login"
      className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted transition hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden /> Back to sign in
    </Link>
  );
}
