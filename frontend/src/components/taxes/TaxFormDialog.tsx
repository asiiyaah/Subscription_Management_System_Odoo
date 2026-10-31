import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxList } from "@/components/ui/CheckboxList";
import { Dialog } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { lookupService } from "@/services/lookupService";
import { taxService } from "@/services/taxService";
import type { ApiError } from "@/services/api";
import type { TaxInput, TaxRule, TaxType } from "@/types/tax";
import type { Id } from "@/types/common";

const FORM_ID = "tax-form";

interface Props {
  open: boolean;
  /** Rule to edit; null = create. */
  tax: TaxRule | null;
  onClose: () => void;
}

/** Create / edit a tax rule (R23). Admin only. */
export function TaxFormDialog({ open, tax, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tax ? `Edit ${tax.name}` : "New tax rule"}
      description="Taxes are calculated automatically on subscription and invoice lines. Changes apply to new invoices only."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID}>
            {tax ? "Save changes" : "Create tax rule"}
          </Button>
        </>
      }
    >
      {open && <TaxForm key={tax?.id ?? "new"} tax={tax} onDone={onClose} />}
    </Dialog>
  );
}

type Errors = Partial<Record<"name" | "rate" | "product_ids", string>>;

function TaxForm({ tax, onDone }: { tax: TaxRule | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const products = useQuery({ queryKey: ["lookups", "products"], queryFn: () => lookupService.products(), staleTime: 5 * 60_000 });

  const [name, setName] = useState(tax?.name ?? "");
  const [type, setType] = useState<TaxType>(tax?.type ?? "percentage");
  const [rate, setRate] = useState(tax ? String(tax.rate) : "");
  const [appliesTo, setAppliesTo] = useState<TaxInput["applies_to"]>(tax?.applies_to ?? "all");
  const [productIds, setProductIds] = useState<Id[]>(tax?.product_ids ?? []);
  const [isDefault, setIsDefault] = useState(tax?.is_default ?? false);
  const [active, setActive] = useState(tax?.active ?? true);
  const [errors, setErrors] = useState<Errors>({});

  // There must always be exactly one default, so the current default can't be switched off here.
  const lockedDefault = tax?.is_default === true;

  const mutation = useMutation<TaxRule, ApiError, TaxInput>({
    mutationFn: (input) => (tax ? taxService.update(tax.id, input) : taxService.create(input)),
    onSuccess: (saved) => {
      toast.success(tax ? `${saved.name} updated` : `${saved.name} created`);
      queryClient.invalidateQueries({ queryKey: ["taxes"] });
      onDone();
    },
    onError: (error) => {
      if (error.status === 409) setErrors((prev) => ({ ...prev, name: error.message }));
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;

    const next: Errors = {};
    const rateNum = Number(rate);
    if (!name.trim()) next.name = "Name the tax as it should appear on invoices, e.g. GST 18%.";
    if (rate.trim() === "" || !(rateNum >= 0)) next.rate = "Enter 0 or more.";
    else if (type === "percentage" && rateNum > 100) next.rate = "A percentage can't be more than 100.";
    if (appliesTo === "products" && productIds.length === 0) next.product_ids = "Choose at least one product.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    mutation.mutate({
      name: name.trim(),
      type,
      rate: rateNum,
      applies_to: appliesTo,
      product_ids: appliesTo === "products" ? productIds : [],
      is_default: isDefault,
      active: isDefault ? true : active,
    });
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-5">
      {mutation.isError && mutation.error.status !== 409 && <Alert tone="error">{mutation.error.message}</Alert>}

      <TextField
        label="Name on invoice"
        placeholder="GST 18%"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={errors.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SegmentedControl
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: "percentage", label: "Percentage" },
            { value: "fixed", label: "Fixed per unit" },
          ]}
        />
        <TextField
          label={type === "percentage" ? "Rate (%)" : "Amount per unit (₹)"}
          type="number"
          inputMode="decimal"
          min={0}
          placeholder={type === "percentage" ? "18" : "25"}
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          error={errors.rate}
        />
      </div>

      {taxService.capabilities.productTargeting ? (
        <SegmentedControl
          label="Applies to"
          value={appliesTo}
          onChange={setAppliesTo}
          options={[
            { value: "all", label: "All products" },
            { value: "products", label: "Specific products" },
          ]}
        />
      ) : (
        <p className="text-xs text-muted">Applies to all products. Product-specific taxes are set on each product.</p>
      )}
      {appliesTo === "products" && (
        <CheckboxList
          label="Products"
          options={products.data}
          selected={productIds}
          onChange={(ids) => {
            setProductIds(ids);
            setErrors((prev) => ({ ...prev, product_ids: undefined }));
          }}
          error={errors.product_ids}
        />
      )}

      <div className="space-y-4 rounded-2xl border border-line bg-surface-2/40 p-4">
        <Switch
          label="Default tax"
          description={
            lockedDefault
              ? "This is the default. To change it, make another tax the default."
              : "Used for any product that no other tax rule covers. Replaces the current default."
          }
          checked={isDefault}
          onChange={setIsDefault}
          disabled={lockedDefault}
        />
        <Switch
          label="Active"
          description={isDefault ? "The default tax is always active." : "Inactive rules are not applied to new invoices."}
          checked={isDefault || active}
          onChange={setActive}
          disabled={isDefault}
        />
      </div>

      {mutation.isPending && <p className="text-sm text-muted">Saving…</p>}
    </form>
  );
}
