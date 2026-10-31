import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { PasswordRulesChecklist } from "@/components/auth/PasswordRulesChecklist";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { isPasswordValid } from "@/lib/password";
import { accountService } from "@/services/accountService";
import type { ApiError } from "@/services/api";
import type { ChangePasswordRequest } from "@/types/settings";

type Errors = Partial<Record<"current" | "next" | "confirm", string>>;

/** Change your own password — same rules as sign-up (R3). */
export function ChangePasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const mutation = useMutation<{ message: string }, ApiError, ChangePasswordRequest>({
    mutationFn: (body) => accountService.changePassword(body),
    onSuccess: ({ message }) => {
      toast.success(message);
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (error) => {
      if (error.status === 400) setErrors({ current: error.message });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    const found: Errors = {};
    if (!current) found.current = "Enter your current password.";
    if (!isPasswordValid(next)) found.next = "New password doesn't meet all the requirements below.";
    else if (next === current) found.next = "Choose a password different from your current one.";
    if (confirm !== next) found.confirm = "Passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate({ current_password: current, new_password: next });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-md space-y-4">
      {mutation.isError && mutation.error.status !== 400 && <Alert tone="error">{mutation.error.message}</Alert>}
      <TextField
        label="Current password"
        revealable
        autoComplete="current-password"
        icon={<Lock />}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={errors.current}
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
      <Button type="submit" loading={mutation.isPending}>
        Change password
      </Button>
    </form>
  );
}
