import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { PageHeader } from "@/components/common/PageHeader";

/** My profile (C4): contact and billing details + change password. */
export default function MyProfile() {
  return (
    <>
      <PageHeader title="Profile" description="Your contact details and billing address." />
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-surface/70 p-5 sm:p-6">
          <h2 className="mb-5 font-semibold">Your details</h2>
          <ProfileForm customerFields />
        </section>
        <section className="rounded-2xl border border-line bg-surface/70 p-5 sm:p-6">
          <h2 className="font-semibold">Change password</h2>
          <p className="mb-5 mt-0.5 text-sm text-muted">More than 8 characters, with an uppercase letter, a lowercase letter and a special character.</p>
          <ChangePasswordForm />
        </section>
      </div>
    </>
  );
}
