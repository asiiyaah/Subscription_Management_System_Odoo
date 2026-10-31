import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Lock, LogOut } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import { PasswordRulesChecklist } from "@/components/auth/PasswordRulesChecklist";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { homePathFor, useAuth } from "@/context/AuthContext";
import { isPasswordValid } from "@/lib/password";
import { accountService } from "@/services/accountService";
import type { ApiError } from "@/services/api";
import type { ChangePasswordRequest, ChangePasswordResponse } from "@/types/settings";

type Errors = Partial<Record<"current" | "next" | "confirm", string>>;

/**
 * First login after an admin set a temporary password: the user must choose their own
 * before anything else works (the backend blocks other requests until then).
 */
export default function SetPassword() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const mutation = useMutation<ChangePasswordResponse, ApiError, ChangePasswordRequest>({
    mutationFn: (body) => accountService.changePassword(body),
    onSuccess: () => {
      updateUser({ must_change_password: false });
      toast.success("Your password is set. Welcome!");
      if (user) navigate(homePathFor(user.role), { replace: true });
    },
    onError: (error) => {
      if (error.status === 400) setErrors({ current: error.message });
    },
  });

  if (!user) return <Navigate to="/login" replace />;
  if (!user.must_change_password) return <Navigate to={homePathFor(user.role)} replace />;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    const found: Errors = {};
    if (!current) found.current = "Enter the temporary password you were given.";
    if (!isPasswordValid(next)) found.next = "Password doesn't meet all the requirements below.";
    else if (next === current) found.next = "Choose a password different from the temporary one.";
    if (confirm !== next) found.confirm = "Passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate({ current_password: current, new_password: next });
  }

  return (
    <AuthLayout
      title="Set your own password"
      subtitle={`Hi ${user.name.split(" ")[0]} — you signed in with a temporary password. Choose a new one to continue.`}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {mutation.isError && mutation.error.status !== 400 && <Alert tone="error">{mutation.error.message}</Alert>}
        <TextField
          label="Temporary password"
          revealable
          autoComplete="current-password"
          icon={<Lock />}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
          autoFocus
        />
        <div className="space-y-2.5">
          <TextField
            label="New password"
            revealable
            autoComplete="new-password"
            icon={<Lock />}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={errors.next}
          />
          <PasswordRulesChecklist password={next} />
        </div>
        <TextField
          label="Confirm new password"
          revealable
          autoComplete="new-password"
          icon={<Lock />}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          hint={confirm && confirm === next ? <span className="text-xs font-medium text-success">Passwords match</span> : null}
        />
        <Button type="submit" block loading={mutation.isPending} className="mt-2">
          {mutation.isPending ? "Saving…" : "Set password and continue"}
        </Button>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-muted transition hover:text-ink"
        >
          <LogOut className="size-4" aria-hidden /> Log out
        </button>
      </form>
    </AuthLayout>
  );
}
