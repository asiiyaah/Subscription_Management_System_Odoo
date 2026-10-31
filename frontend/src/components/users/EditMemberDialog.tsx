import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ROLE_DESCRIPTIONS } from "@/components/users/AddStaffDialog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { userService } from "@/services/userService";
import type { ApiError } from "@/services/api";
import type { TeamMember, TeamRole, UpdateTeamMember } from "@/types/user";

const FORM_ID = "edit-member-form";

/** Change a team member's name or role. Email is their login, so it isn't editable here. */
export function EditMemberDialog({ member, isSelf, onClose }: { member: TeamMember | null; isSelf: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      title={member ? `Edit ${member.name}` : "Edit"}
      description={member?.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID}>
            Save changes
          </Button>
        </>
      }
    >
      {member && <EditForm key={member.id} member={member} isSelf={isSelf} onDone={onClose} />}
    </Dialog>
  );
}

function EditForm({ member, isSelf, onDone }: { member: TeamMember; isSelf: boolean; onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState<TeamRole>(member.role);
  const [error, setError] = useState<string>();

  const mutation = useMutation<TeamMember, ApiError, UpdateTeamMember>({
    mutationFn: (input) => userService.update(member.id, input),
    onSuccess: (saved) => {
      toast.success(`${saved.name} updated`);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onDone();
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    if (!name.trim()) {
      setError("Enter their full name.");
      return;
    }
    setError(undefined);
    mutation.mutate({ name: name.trim(), role });
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-5">
      {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}
      <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={error} />
      {isSelf ? (
        <Alert tone="info">You can't change your own role. Ask another admin.</Alert>
      ) : (
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
      )}
      {mutation.isPending && <p className="text-sm text-muted">Saving…</p>}
    </form>
  );
}
