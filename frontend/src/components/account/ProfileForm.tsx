import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Mail, MapPin, Phone, User as UserIcon } from "lucide-react";
import { ErrorState, Skeleton } from "@/components/common/States";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { accountService } from "@/services/accountService";
import type { ApiError } from "@/services/api";
import type { Profile, ProfileUpdate } from "@/types/settings";

/** Your own details. Customers also get company and billing address. Email is the login, so it's read-only. */
export function ProfileForm({ customerFields = false }: { customerFields?: boolean }) {
  const profile = useQuery<Profile, ApiError>({ queryKey: ["account", "profile"], queryFn: () => accountService.getProfile() });

  if (profile.isPending) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  }
  if (profile.isError) return <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />;
  return <ProfileFields key={profile.dataUpdatedAt} profile={profile.data} customerFields={customerFields} />;
}

function ProfileFields({ profile, customerFields }: { profile: Profile; customerFields: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { updateUser } = useAuth();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [company, setCompany] = useState(profile.company ?? "");
  const [address, setAddress] = useState(profile.billing_address ?? "");
  const [nameError, setNameError] = useState<string>();

  const dirty =
    name !== profile.name ||
    phone !== (profile.phone ?? "") ||
    company !== (profile.company ?? "") ||
    address !== (profile.billing_address ?? "");

  const mutation = useMutation<Profile, ApiError, ProfileUpdate>({
    mutationFn: (input) => accountService.updateProfile(input),
    onSuccess: (saved) => {
      toast.success("Profile saved");
      updateUser({ name: saved.name });
      queryClient.setQueryData(["account", "profile"], saved);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    if (!name.trim()) {
      setNameError("Enter your name.");
      return;
    }
    setNameError(undefined);
    mutation.mutate({
      name: name.trim(),
      phone: phone.trim() || undefined,
      ...(customerFields ? { company: company.trim() || undefined, billing_address: address.trim() || undefined } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" icon={<UserIcon />} value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
        <TextField label="Email" icon={<Mail />} value={profile.email} readOnly disabled hint={<span className="text-xs text-muted">Used to log in</span>} />
        {(customerFields || accountService.capabilities.staffPhone) && (
          <TextField label="Phone (optional)" type="tel" icon={<Phone />} placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        )}
        {customerFields && (
          <TextField label="Company (optional)" icon={<Building2 />} value={company} onChange={(e) => setCompany(e.target.value)} />
        )}
      </div>
      {customerFields && accountService.capabilities.billingAddress && (
        <div className="relative">
          <MapPin className="pointer-events-none absolute right-3.5 top-10 size-4 text-muted" aria-hidden />
          <Textarea label="Billing address (printed on your invoices)" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={mutation.isPending} disabled={!dirty}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
