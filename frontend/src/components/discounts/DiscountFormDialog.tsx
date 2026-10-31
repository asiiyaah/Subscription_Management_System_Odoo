import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shuffle } from "lucide-react";
import { formatDiscountConditions, formatDiscountValue } from "@/components/discounts/discountFormat";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxList } from "@/components/ui/CheckboxList";
import { Dialog } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { toIsoDate } from "@/lib/format";
import { discountService } from "@/services/discountService";
import { lookupService } from "@/services/lookupService";
import type { ApiError } from "@/services/api";
import type { Discount, DiscountInput, DiscountType } from "@/types/discount";
import type { Id } from "@/types/common";

const FORM_ID = "discount-form";
const CODE_PATTERN = /^[A-Z0-9_-]{3,20}$/;

interface Props {
  open: boolean;
  /** Discount to edit; null = create a new one. */
  discount: Discount | null;
  onClose: () => void;
}

/** Create / edit a discount rule (R27–R32). Admin only. */
export function DiscountFormDialog({ open, discount, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={discount ? `Edit ${discount.code}` : "New discount"}
      description={
        discount && discount.used_count > 0
          ? `Used ${discount.used_count} time${discount.used_count === 1 ? "" : "s"} so far. Changes apply to future invoices only.`
          : "Applied automatically to the next invoice of any subscription that qualifies."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID}>
            {discount ? "Save changes" : "Create discount"}
          </Button>
        </>
      }
    >
      {open && <DiscountForm key={discount?.id ?? "new"} discount={discount} onDone={onClose} />}
    </Dialog>
  );
}

type Errors = Partial<Record<"code" | "name" | "value" | "min_purchase" | "min_quantity" | "start_date" | "end_date" | "usage_limit" | "product_ids", string>>;

function DiscountForm({ discount, onDone }: { discount: Discount | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const products = useQuery({ queryKey: ["lookups", "products"], queryFn: () => lookupService.products(), staleTime: 5 * 60_000 });

  const [code, setCode] = useState(discount?.code ?? "");
  const [name, setName] = useState(discount?.name ?? "");
  const [type, setType] = useState<DiscountType>(discount?.type ?? "percentage");
  const [value, setValue] = useState(discount ? String(discount.value) : "");
  const [minPurchase, setMinPurchase] = useState(discount?.min_purchase ? String(discount.min_purchase) : "");
  const [minQuantity, setMinQuantity] = useState(discount?.min_quantity ? String(discount.min_quantity) : "");
  const [startDate, setStartDate] = useState(discount?.start_date ?? toIsoDate());
  const [endDate, setEndDate] = useState(discount?.end_date ?? "");
  const [usageLimit, setUsageLimit] = useState(discount?.usage_limit ? String(discount.usage_limit) : "");
  const [appliesTo, setAppliesTo] = useState<DiscountInput["applies_to"]>(discount?.applies_to ?? "subscription");
  const [productIds, setProductIds] = useState<Id[]>(discount?.product_ids ?? []);
  const [active, setActive] = useState(discount?.active ?? true);
  const [errors, setErrors] = useState<Errors>({});

  const mutation = useMutation<Discount, ApiError, DiscountInput>({
    mutationFn: (input) => (discount ? discountService.update(discount.id, input) : discountService.create(input)),
    onSuccess: (saved) => {
      toast.success(discount ? `${saved.code} updated` : `${saved.code} created`);
      queryClient.invalidateQueries({ queryKey: ["discounts"] });
      onDone();
    },
    onError: (error) => {
      if (error.status === 409) setErrors((prev) => ({ ...prev, code: error.message }));
    },
  });

  function generateCode() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const random = Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
    setCode(random);
    setErrors((prev) => ({ ...prev, code: undefined }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;

    const next: Errors = {};
    const numValue = Number(value);
    const optionalNumber = (raw: string) => (raw.trim() === "" ? undefined : Number(raw));
    const minPurchaseNum = optionalNumber(minPurchase);
    const minQuantityNum = optionalNumber(minQuantity);
    const usageLimitNum = optionalNumber(usageLimit);

    if (!CODE_PATTERN.test(code)) next.code = "3–20 characters: capital letters, numbers, - or _.";
    if (!name.trim()) next.name = "Give the discount a name.";
    if (!(numValue > 0)) next.value = "Enter a value greater than 0.";
    else if (type === "percentage" && numValue > 100) next.value = "A percentage can't be more than 100.";
    if (minPurchaseNum !== undefined && !(minPurchaseNum >= 0)) next.min_purchase = "Enter 0 or more.";
    if (minQuantityNum !== undefined && !(Number.isInteger(minQuantityNum) && minQuantityNum >= 1)) {
      next.min_quantity = "Enter a whole number, 1 or more.";
    }
    if (!startDate) next.start_date = "Choose a start date.";
    if (endDate && startDate && endDate < startDate) next.end_date = "Must be on or after the start date.";
    if (usageLimitNum !== undefined && !(Number.isInteger(usageLimitNum) && usageLimitNum >= 1)) {
      next.usage_limit = "Enter a whole number, 1 or more.";
    } else if (discount && usageLimitNum !== undefined && usageLimitNum < discount.used_count) {
      next.usage_limit = `Already used ${discount.used_count} times — the limit can't be lower.`;
    }
    if (appliesTo === "products" && productIds.length === 0) next.product_ids = "Choose at least one product.";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    mutation.mutate({
      code,
      name: name.trim(),
      type,
      value: numValue,
      min_purchase: minPurchaseNum || undefined,
      min_quantity: minQuantityNum,
      start_date: startDate,
      end_date: endDate || undefined,
      usage_limit: usageLimitNum,
      applies_to: appliesTo,
      product_ids: appliesTo === "products" ? productIds : [],
      active,
    });
  }

  const preview = Number(value) > 0 ? formatDiscountValue({ type, value: Number(value) }) : null;

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-6">
      {mutation.isError && mutation.error.status !== 409 && <Alert tone="error">{mutation.error.message}</Alert>}

      <FormSection title="Discount">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Code"
            placeholder="SEATS10"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ""))}
            error={errors.code}
            className="[&_input]:font-mono [&_input]:tracking-wider"
            hint={
              <button type="button" onClick={generateCode} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Shuffle className="size-3" aria-hidden /> Generate
              </button>
            }
          />
          <TextField label="Name" placeholder="10% off for 5+ seats" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
          <SegmentedControl
            label="Type"
            value={type}
            onChange={setType}
            options={[
              { value: "percentage", label: "Percentage" },
              { value: "fixed", label: "Fixed amount" },
            ]}
          />
          <TextField
            label={type === "percentage" ? "Value (%)" : "Value (₹)"}
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={type === "percentage" ? "10" : "500"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            error={errors.value}
            hint={preview && <span className="text-xs font-semibold text-success">{preview}</span>}
          />
        </div>
      </FormSection>

      <FormSection title="Conditions" note="Leave blank for no minimum. If both are set, the order must meet both.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Minimum purchase (₹)"
            type="number"
            min={0}
            placeholder="e.g. 1999"
            value={minPurchase}
            onChange={(event) => setMinPurchase(event.target.value)}
            error={errors.min_purchase}
          />
          <TextField
            label="Minimum quantity (seats)"
            type="number"
            min={1}
            step={1}
            placeholder="e.g. 5"
            value={minQuantity}
            onChange={(event) => setMinQuantity(event.target.value)}
            error={errors.min_quantity}
          />
        </div>
      </FormSection>

      <FormSection title="Validity & usage" note="It stops applying automatically after the end date or once the limit is reached.">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} error={errors.start_date} />
          <TextField
            label="End date (optional)"
            type="date"
            min={startDate}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            error={errors.end_date}
          />
          <TextField
            label="Usage limit (optional)"
            type="number"
            min={1}
            step={1}
            placeholder="Unlimited"
            value={usageLimit}
            onChange={(event) => setUsageLimit(event.target.value)}
            error={errors.usage_limit}
          />
        </div>
      </FormSection>

      <FormSection title="Applies to">
        <div className="space-y-4">
          <SegmentedControl
            label="Apply the discount to"
            value={appliesTo}
            onChange={setAppliesTo}
            options={[
              { value: "subscription", label: "Whole subscription" },
              { value: "products", label: "Specific products" },
            ]}
          />
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
        </div>
      </FormSection>

      <div className="rounded-2xl border border-line bg-surface-2/40 p-4">
        <Switch
          label="Active"
          description="Turn off to pause this discount without deleting it."
          checked={active}
          onChange={setActive}
        />
      </div>

      {preview && (
        <p className="text-xs text-muted">
          Summary: <span className="font-semibold text-ink">{code || "CODE"}</span> · {preview} ·{" "}
          {formatDiscountConditions({ min_purchase: Number(minPurchase) || undefined, min_quantity: Number(minQuantity) || undefined })}
          {usageLimit ? ` · up to ${usageLimit} uses` : " · unlimited uses"}
        </p>
      )}
      {mutation.isPending && <p className="text-sm text-muted">Saving…</p>}
    </form>
  );
}

function FormSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section role="group" aria-labelledby={titleId} className="space-y-3">
      <div>
        <h3 id={titleId} className="text-xs font-semibold uppercase tracking-wider text-muted">
          {title}
        </h3>
        {note && <p className="mt-0.5 text-xs text-muted/80">{note}</p>}
      </div>
      {children}
    </section>
  );
}
