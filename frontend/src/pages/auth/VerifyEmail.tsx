import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { Alert } from "@/components/ui/Alert";
import { TextField } from "@/components/ui/TextField";
import { authService } from "@/services/authService";
import type { ApiError } from "@/services/api";
import type { MessageResponse } from "@/types/auth";

const BUTTON =
  "flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:brightness-110";

/** Opened from the "Confirm your email" link sent at sign-up (when the backend requires verification). */
export default function VerifyEmail() {
  const token = useSearchParams()[0].get("token");
  const [email, setEmail] = useState("");

  const mutation = useMutation<MessageResponse, ApiError>({
    mutationFn: () => authService.verifyEmail(token ?? ""),
  });

  // Confirm automatically once (refs survive React's double-run of effects in development).
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    mutation.mutate();
  }, [token, mutation]);

  if (mutation.isSuccess) {
    return (
      <AuthLayout title="Email confirmed" subtitle="Thanks — your account is ready.">
        <div className="space-y-5 text-center">
          <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden />
          <Alert tone="success">{mutation.data.message}</Alert>
          <Link to="/login" className={BUTTON}>
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (token && !mutation.isError) {
    return (
      <AuthLayout title="Confirming your email…" subtitle="This only takes a moment.">
        <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-label="Confirming" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="This link didn't work" subtitle="Confirmation links expire after 48 hours and work once.">
      <div className="space-y-5">
        {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}
        <TextField
          label="Your email"
          type="email"
          icon={<Mail />}
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ResendVerification email={email.trim()} />
        <Link to="/login" className="block text-center text-sm font-medium text-muted hover:text-ink">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
