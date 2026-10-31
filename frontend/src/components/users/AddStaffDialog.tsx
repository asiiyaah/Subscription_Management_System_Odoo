import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Mail, MailCheck, User as UserIcon } from "lucide-react";
import { PasswordRulesChecklist } from "@/components/auth/PasswordRulesChecklist";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { EMAIL_PATTERN, isPasswordValid } from "@/lib/password";
import { userService } from "@/services/userService";
import type { ApiError } from "@/services/api";
import type { CreateTeamMemberResult, NewTeamMember, TeamRole } from "@/types/user";

const FORM_ID = "add-staff-form";

export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  staff: "Day-to-day work: customers, subscriptions, invoices, payments, reports. Can't change pricing, taxes or users.",
  admin: "Everything, including discounts, taxes, users and approving AI actions.",
};

/** Admin adds a member of staff (R7): invite by email, or set a temporary password. */
export function AddStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [result, setResult] = useState<CreateTeamMemberResult | null>(null);

  function close() {
    setResult(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={result ? "Staff member added" : "Add staff member"}
      description={result ? undefined : "They'll sign in with their email. Only admins can add staff."}
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID}>
              Add staff member
            </Button>
          </>
        )
      }
    >
      {open &&
        (result ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success/15 text-success ring-1 ring-success/30">
              <MailCheck className="size-7" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">
                {result.user.name} · <span className="capitalize">{result.user.role}</span>
              </p>
              <p className="text-sm text-muted">{result.message}</p>
            </div>
            {result.dev_invite_link && (
              <Alert tone="info">
                <p className="font-semibold">Demo mode — no email is sent</p>
                <Link to={result.dev_invite_link} className="font-semibold text-primary hover:underline">
                  Open the invite link (set password) →
                </Link>
              </Alert>
            )}
          </div>
        ) : (
          <AddStaffForm onCreated={setResult} />
        ))}
    </Dialog>
  );
}

type Errors = Partial<Record<"name" | "email" | "password", string>>;

function AddStaffForm({ onCreated }: { onCreated: (result: CreateTeamMemberResult) => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("staff");
  // Live backend supports SMTP-backed invitations; the result explains if SMTP is not configured.
  const canInvite = userService.capabilities.invite;
  const [access, setAccess] = useState<"invite" | "password">(canInvite ? "invite" : "password");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const mutation = useMutation<CreateTeamMemberResult, ApiError, NewTeamMember>({
    mutationFn: (input) => userService.create(input),
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onCreated(result);
    },
    onError: (error) => {
      // R2: one account per email.
      if (error.status === 409) setErrors((prev) => ({ ...prev, email: error.message }));
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter their full name.";
    if (!EMAIL_PATTERN.test(email.trim())) next.email = "Enter a valid email address.";
    if (access === "password" && !isPasswordValid(password)) next.password = "Password doesn't meet all the requirements below.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate({
      name: name.trim(),
      email: email.trim(),
      role,
      send_invite: access === "invite",
      password: access === "password" ? password : undefined,
    });
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-5">
      {mutation.isError && mutation.error.status !== 409 && <Alert tone="error">{mutation.error.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" icon={<UserIcon />} placeholder="Riya Sharma" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <TextField
          label="Work email"
          type="email"
          icon={<Mail />}
          placeholder="riya@subscriptiq.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={errors.email}
        />
      </div>

      <div className="space-y-2">
        <SegmentedControl
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: "staff", label: "Staff" },
            { value: "admin", label: "Admin" },
          ]}
        />
        <p className="text-xs text-muted">{ROLE_DESCRIPTIONS[role]}</p>
      </div>

      <div className="space-y-3">
        {canInvite ? (
          <SegmentedControl
            label="How they get access"
            value={access}
            onChange={setAccess}
            options={[
              { value: "invite", label: "Email an invite" },
              { value: "password", label: "Set a temporary password" },
            ]}
          />
        ) : (
          <p className="text-sm font-medium text-ink">Temporary password</p>
        )}
        {access === "invite" ? (
          <p className="text-xs text-muted">They'll get an email with a link to choose their own password. The link is valid for 48 hours and works once.</p>
        ) : (
          <div className="space-y-2.5">
            <TextField
              label="Temporary password"
              revealable
              autoComplete="new-password"
              icon={<Lock />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            <PasswordRulesChecklist password={password} />
            <p className="text-xs text-muted">Share it with them privately (not by email). They'll be asked to choose their own password the first time they log in.</p>
          </div>
        )}
      </div>
      {mutation.isPending && <p className="text-sm text-muted">Adding…</p>}
    </form>
  );
}
