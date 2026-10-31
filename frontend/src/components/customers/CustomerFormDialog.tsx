import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { customerService } from "@/services/customerService";
import type { Customer, CustomerCreate, CustomerUpdate } from "@/types/customer";
import { ApiError } from "@/services/api";

interface CustomerFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** If provided, the dialog is in edit mode. */
  customer?: Customer;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  company: string;
  billing_address: string;
}

const EMPTY: FormState = { name: "", email: "", phone: "", company: "", billing_address: "" };

function toFormState(c: Customer): FormState {
  return {
    name: c.name,
    email: c.email,
    phone: c.phone ?? "",
    company: c.company ?? "",
    billing_address: c.billing_address ?? "",
  };
}

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!f.name.trim()) errors.name = "Name is required.";
  if (!f.email.trim()) {
    errors.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
    errors.email = "Enter a valid email address.";
  }
  return errors;
}

export function CustomerFormDialog({ open, onClose, customer }: CustomerFormDialogProps) {
  const isEdit = Boolean(customer);
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  // Reset form when dialog opens/closes or target customer changes.
  useEffect(() => {
    if (open) {
      setForm(customer ? toFormState(customer) : EMPTY);
      setFieldErrors({});
    }
  }, [open, customer]);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  const createMutation = useMutation({
    mutationFn: (data: CustomerCreate) => customerService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created successfully.");
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to create customer.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CustomerUpdate) => customerService.update(customer!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", customer!.id] });
      toast.success("Customer updated successfully.");
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to update customer.");
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validate(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    const payload: CustomerCreate = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      company: form.company.trim() || undefined,
      billing_address: form.billing_address.trim() || undefined,
    };
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={isPending ? () => {} : onClose}
      title={isEdit ? "Edit Customer" : "New Customer"}
      description={isEdit ? "Update contact and billing information." : "Add a new customer to your account."}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={isPending}>
            {isEdit ? "Save changes" : "Create customer"}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField
          label="Full name"
          placeholder="Priya Sharma"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          error={fieldErrors.name}
          required
        />
        <TextField
          label="Email address"
          type="email"
          placeholder="priya@company.in"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          error={fieldErrors.email}
          required
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Phone"
            type="tel"
            placeholder="+91 98765 43210"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            error={fieldErrors.phone}
          />
          <TextField
            label="Company"
            placeholder="Acme Corp India"
            value={form.company}
            onChange={(e) => set("company", e.target.value)}
            error={fieldErrors.company}
          />
        </div>
        <Textarea
          label="Billing address"
          placeholder="12, MG Road, Bengaluru, Karnataka 560001"
          rows={3}
          value={form.billing_address}
          onChange={(e) => set("billing_address", e.target.value)}
          error={fieldErrors.billing_address}
        />
      </form>
    </Dialog>
  );
}
