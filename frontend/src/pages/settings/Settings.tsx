import { useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, Skeleton } from "@/components/common/States";
import { Tabs } from "@/components/common/Tabs";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { useIsAdmin } from "@/context/AuthContext";
import { EMAIL_PATTERN } from "@/lib/password";
import { settingsService } from "@/services/settingsService";
import type { ApiError } from "@/services/api";
import type { AutomationSettings, BusinessSettings } from "@/types/settings";

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PREFIX_PATTERN = /^[A-Z0-9-]{1,8}$/;

/** Settings (A14): Profile & Security for everyone; Business & Automation for admins. Tab is in the URL. */
export default function Settings() {
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { value: "profile", label: "Profile" },
    { value: "security", label: "Password" },
    ...(isAdmin
      ? [
          { value: "business", label: "Business" },
          { value: "automation", label: "Automation" },
        ]
      : []),
  ];
  const requested = params.get("tab") ?? "profile";
  const tab = tabs.some((t) => t.value === requested) ? requested : "profile";

  return (
    <>
      <PageHeader title="Settings" description={isAdmin ? "Your account, business details and automation." : "Your account."} />
      <div className="space-y-6">
        <Tabs aria-label="Settings sections" tabs={tabs} value={tab} onChange={(value) => setParams(value === "profile" ? {} : { tab: value }, { replace: true })} />
        {tab === "profile" && (
          <Panel title="Profile" description="How your name appears to the team.">
            <ProfileForm />
          </Panel>
        )}
        {tab === "security" && (
          <Panel title="Change password" description="More than 8 characters, with an uppercase letter, a lowercase letter and a special character.">
            <ChangePasswordForm />
          </Panel>
        )}
        {tab === "business" && isAdmin && <BusinessTab />}
        {tab === "automation" && isAdmin && <AutomationTab />}
      </div>
    </>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface/70 p-5 sm:p-6">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function LoadingPanel() {
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface/70 p-6">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-11" />
      ))}
    </div>
  );
}

// --- Business ----------------------------------------------------------------------------

function BusinessTab() {
  const query = useQuery<BusinessSettings, ApiError>({ queryKey: ["settings", "business"], queryFn: () => settingsService.getBusiness() });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  return <BusinessForm key={query.dataUpdatedAt} initial={query.data} />;
}

type BusinessErrors = Partial<Record<"company_name" | "email" | "gstin" | "address" | "invoice_prefix" | "subscription_prefix" | "payment_terms_days" | "ifsc", string>>;

function BusinessForm({ initial }: { initial: BusinessSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<BusinessErrors>({});
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const set = <K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setBank = (key: keyof BusinessSettings["bank"], value: string) => setForm((f) => ({ ...f, bank: { ...f.bank, [key]: value } }));

  const mutation = useMutation<BusinessSettings, ApiError, BusinessSettings>({
    mutationFn: (input) => settingsService.updateBusiness(input),
    onSuccess: (saved) => {
      toast.success("Business details saved — new invoices will use them");
      queryClient.setQueryData(["settings", "business"], saved);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    const e: BusinessErrors = {};
    if (!form.company_name.trim()) e.company_name = "Enter the legal company name.";
    if (!EMAIL_PATTERN.test(form.email.trim())) e.email = "Enter a valid email.";
    if (settingsService.capabilities.gstinAndBank && !GSTIN_PATTERN.test(form.gstin)) e.gstin = "15 characters, e.g. 29AAKCS1234F1Z5.";
    if (!form.address.trim()) e.address = "Enter the registered address.";
    if (!PREFIX_PATTERN.test(form.invoice_prefix)) e.invoice_prefix = "1–8 capital letters, numbers or -.";
    if (!PREFIX_PATTERN.test(form.subscription_prefix)) e.subscription_prefix = "1–8 capital letters, numbers or -.";
    if (!(Number.isInteger(form.payment_terms_days) && form.payment_terms_days >= 0 && form.payment_terms_days <= 120)) {
      e.payment_terms_days = "Whole number of days, 0–120.";
    }
    if (form.bank.ifsc && !IFSC_PATTERN.test(form.bank.ifsc)) e.ifsc = "11 characters, e.g. HDFC0001234.";
    setErrors(e);
    if (Object.keys(e).length === 0) mutation.mutate({ ...form, company_name: form.company_name.trim(), email: form.email.trim() });
  }

  const year = new Date().getFullYear();
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}

      <Panel title="Company" description="Printed at the top of every invoice.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Legal name" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} error={errors.company_name} />
          <TextField
            label="GSTIN"
            value={form.gstin}
            onChange={(e) => set("gstin", e.target.value.toUpperCase().replace(/\s/g, ""))}
            error={errors.gstin}
            disabled={!settingsService.capabilities.gstinAndBank}
            className="[&_input]:font-mono [&_input]:tracking-wider"
          />
          <TextField label="Billing email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
          <TextField label="Phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          <Textarea label="Registered address" className="sm:col-span-2" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} error={errors.address} />
        </div>
      </Panel>

      <Panel title="Invoicing" description="Numbering and default due dates for new invoices and subscriptions.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Invoice prefix"
            value={form.invoice_prefix}
            onChange={(e) => set("invoice_prefix", e.target.value.toUpperCase())}
            error={errors.invoice_prefix}
            hint={<span className="font-mono text-xs text-muted">{form.invoice_prefix}{year}-0046</span>}
          />
          <TextField
            label="Subscription prefix"
            value={form.subscription_prefix}
            onChange={(e) => set("subscription_prefix", e.target.value.toUpperCase())}
            error={errors.subscription_prefix}
            hint={<span className="font-mono text-xs text-muted">{form.subscription_prefix}0020</span>}
          />
          <TextField
            label="Payment terms (days)"
            type="number"
            min={0}
            max={120}
            value={String(form.payment_terms_days)}
            onChange={(e) => set("payment_terms_days", e.target.value === "" ? Number.NaN : Number(e.target.value))}
            error={errors.payment_terms_days}
            hint={<span className="text-xs text-muted">{form.payment_terms_days === 0 ? "Due immediately" : `Net ${form.payment_terms_days}`}</span>}
          />
          <TextField label="Currency" value="INR (₹)" readOnly disabled />
        </div>
      </Panel>

      <Panel title="Bank & UPI" description="Shown under “Payment information” on invoices so customers know how to pay.">
        {!settingsService.capabilities.gstinAndBank && (
          <div className="mb-4">
            <Alert tone="info">GSTIN and bank details can't be saved to the server yet — invoices use the defaults shown here.</Alert>
          </div>
        )}
        <fieldset disabled={!settingsService.capabilities.gstinAndBank} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2">
          <TextField label="UPI ID" placeholder="company@bank" value={form.bank.upi} onChange={(e) => setBank("upi", e.target.value)} />
          <TextField label="Bank and branch" value={form.bank.name} onChange={(e) => setBank("name", e.target.value)} />
          <TextField label="Account number" inputMode="numeric" value={form.bank.account} onChange={(e) => setBank("account", e.target.value.replace(/\s/g, ""))} />
          <TextField label="IFSC" value={form.bank.ifsc} onChange={(e) => setBank("ifsc", e.target.value.toUpperCase())} error={errors.ifsc} />
        </fieldset>
      </Panel>

      <SaveBar dirty={dirty} saving={mutation.isPending} onReset={() => { setForm(initial); setErrors({}); }} />
    </form>
  );
}

// --- Automation --------------------------------------------------------------------------

function AutomationTab() {
  const query = useQuery<AutomationSettings, ApiError>({ queryKey: ["settings", "automation"], queryFn: () => settingsService.getAutomation() });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  return <AutomationForm key={query.dataUpdatedAt} initial={query.data} />;
}

const REMINDER_BEFORE = [0, 3, 7, 14, 30].map((d) => ({ value: String(d), label: d === 0 ? "Off" : `${d} days before` }));
/** Live backend: reminders are simply on (sent 7 days before) or off. */
const REMINDER_ON_OFF = [
  { value: "0", label: "Off" },
  { value: "7", label: "On" },
];
const REMINDER_AFTER = [0, 1, 3, 7, 14].map((d) => ({ value: String(d), label: d === 0 ? "Off" : `${d} day${d > 1 ? "s" : ""} after` }));

function AutomationForm({ initial }: { initial: AutomationSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => setForm((f) => ({ ...f, [key]: value }));

  const mutation = useMutation<AutomationSettings, ApiError, AutomationSettings>({
    mutationFn: (input) => settingsService.updateAutomation(input),
    onSuccess: (saved) => {
      toast.success("Automation settings saved");
      queryClient.setQueryData(["settings", "automation"], saved);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!mutation.isPending) mutation.mutate(form);
      }}
      noValidate
      className="space-y-6"
    >
      {mutation.isError && <Alert tone="error">{mutation.error.message}</Alert>}

      <Panel title="Billing run" description="Replaces typing invoices by hand on billing day.">
        <div className="space-y-4">
          <Switch
            label="Generate invoices automatically every day"
            description="Creates draft invoices for every subscription whose billing period has started. Periods already billed are skipped — nothing is billed twice."
            checked={form.auto_generate_invoices}
            onChange={(v) => set("auto_generate_invoices", v)}
          />
          {form.auto_generate_invoices && settingsService.capabilities.invoiceRunTime && (
            <TextField label="Run at" type="time" className="max-w-40" value={form.invoice_run_time} onChange={(e) => set("invoice_run_time", e.target.value)} />
          )}
        </div>
      </Panel>

      <Panel title="Reminders" description="Emails go to each customer's billing address.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Renewal reminder"
            options={settingsService.capabilities.reminderDays ? REMINDER_BEFORE : REMINDER_ON_OFF}
            value={String(form.renewal_reminder_days)}
            onChange={(e) => set("renewal_reminder_days", Number(e.target.value))}
          />
          {settingsService.capabilities.overdueReminders && (
            <Select
              label="Overdue reminder"
              options={REMINDER_AFTER}
              value={String(form.overdue_reminder_days)}
              onChange={(e) => set("overdue_reminder_days", Number(e.target.value))}
            />
          )}
        </div>
        <p className="mt-3 text-xs text-muted">
          {form.renewal_reminder_days ? `Customers hear about renewals ${form.renewal_reminder_days} days before the end date. ` : "No renewal reminders. "}
          {form.overdue_reminder_days ? `Unpaid invoices get a nudge ${form.overdue_reminder_days} day${form.overdue_reminder_days > 1 ? "s" : ""} after the due date.` : "No overdue reminders."}
        </p>
      </Panel>

      <Panel title="Subscription lifecycle">
        <Switch
          label="Close subscriptions automatically when they end"
          description="Only for plans set to close on their own. Plans that renew are left open."
          checked={form.auto_close_expired}
          onChange={(v) => set("auto_close_expired", v)}
        />
      </Panel>

      <SaveBar dirty={dirty} saving={mutation.isPending} onReset={() => setForm(initial)} />
    </form>
  );
}

/** Sticky footer with Save / Discard, visible only when something changed. */
function SaveBar({ dirty, saving, onReset }: { dirty: boolean; saving: boolean; onReset: () => void }) {
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur">
      <p className="mr-auto text-sm text-muted">{dirty ? "You have unsaved changes." : "All changes saved."}</p>
      <Button variant="ghost" onClick={onReset} disabled={!dirty || saving}>
        Discard
      </Button>
      <Button type="submit" loading={saving} disabled={!dirty}>
        Save changes
      </Button>
    </div>
  );
}
