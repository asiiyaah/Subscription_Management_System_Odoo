import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Building2, Lock, Mail, Phone, User as UserIcon } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PasswordRulesChecklist } from "@/components/auth/PasswordRulesChecklist";
import { homePathFor, useAuth } from "@/context/AuthContext";
import { EMAIL_PATTERN, isPasswordValid } from "@/lib/password";
import { authService } from "@/services/authService";
import type { ApiError } from "@/services/api";
import type { SignupResponse } from "@/types/auth";

type Field = "name" | "email" | "phone" | "company" | "password" | "confirm";

export default function Signup() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<Record<Field, string>>({
    name: "",
    email: "",
    phone: "",
    company: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const mutation = useMutation<SignupResponse, ApiError>({
    mutationFn: () =>
      authService.signup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        company: form.company.trim() || undefined,
      }),
    onSuccess: ({ user: created }) => {
      navigate("/login", {
        replace: true,
        state: { message: "Account created. Sign in to continue.", email: created.email },
      });
    },
    onError: (error) => {
      // R2: each email can belong to only one account.
      if (error.status === 409) setErrors((prev) => ({ ...prev, email: error.message }));
    },
  });

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  const update = (field: Field) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Enter your full name.";
    if (!EMAIL_PATTERN.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (!isPasswordValid(form.password)) next.password = "Password doesn't meet all the requirements below.";
    if (form.confirm !== form.password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length === 0) mutation.mutate();
  }

  const showGeneralError = mutation.isError && mutation.error.status !== 409;
  const passwordsMatch = form.confirm.length > 0 && form.confirm === form.password;

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {showGeneralError && <Alert tone="error">{mutation.error.message}</Alert>}

        <TextField
          label="Full name"
          autoComplete="name"
          placeholder="Asha Menon"
          icon={<UserIcon />}
          value={form.name}
          onChange={update("name")}
          error={errors.name}
          autoFocus
        />

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          icon={<Mail />}
          value={form.email}
          onChange={update("email")}
          error={errors.email}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            icon={<Phone />}
            value={form.phone}
            onChange={update("phone")}
          />
          <TextField
            label="Company (optional)"
            autoComplete="organization"
            placeholder="Acme Retail"
            icon={<Building2 />}
            value={form.company}
            onChange={update("company")}
          />
        </div>

        <div className="space-y-2.5">
          <TextField
            label="Password"
            revealable
            autoComplete="new-password"
            placeholder="Create a strong password"
            icon={<Lock />}
            value={form.password}
            onChange={update("password")}
            error={errors.password}
          />
          <PasswordRulesChecklist password={form.password} />
        </div>

        <TextField
          label="Confirm password"
          revealable
          autoComplete="new-password"
          placeholder="Re-enter your password"
          icon={<Lock />}
          value={form.confirm}
          onChange={update("confirm")}
          error={errors.confirm}
          hint={passwordsMatch ? <span className="text-xs font-medium text-success">Passwords match</span> : null}
        />

        <Button type="submit" loading={mutation.isPending} className="mt-2">
          {mutation.isPending ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-center text-xs text-muted">
          You'll be able to view and manage your subscriptions and invoices from your customer portal.
        </p>
      </form>
    </AuthLayout>
  );
}
