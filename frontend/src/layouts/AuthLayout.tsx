import type { ReactNode } from "react";
import { BellRing, FileText, Sparkles, TrendingUp } from "lucide-react";
import { Logo } from "@/components/common/Logo";

interface AuthLayoutProps {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}

/** Split screen used by Login, Sign Up, Forgot and Reset Password. */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh">
      <BrandPanel />

      <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-primary/15 blur-3xl lg:hidden" />
        <div className="relative w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className="rounded-3xl border border-line bg-surface/80 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden bg-gradient-to-br from-magenta via-[#9b1b8f] to-[#3a0d5c] p-10 lg:flex xl:p-14">
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-accent/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-violet/40 blur-3xl" />

      <div className="relative">
        <Logo light />
      </div>

      <div className="relative space-y-8">
        <div>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">
            Every plan, renewal and invoice — in one place.
          </h2>
          <p className="mt-4 max-w-md text-base text-white/75">
            Run recurring billing, chase overdue payments and ask the AI assistant anything about your
            subscription business.
          </p>
        </div>

        <div className="grid max-w-md grid-cols-2 gap-3">
          <PreviewStat icon={<TrendingUp />} label="MRR" value="₹1,24,500" trend="+8.2%" />
          <PreviewStat icon={<FileText />} label="Invoices due" value="42" trend="today" />
        </div>

        <div className="max-w-md rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
            <Sparkles className="size-3.5" aria-hidden /> AI Assistant
          </div>
          <p className="mt-2 text-sm text-white">"Which subscriptions expire this week?"</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-xs text-white/85">
            <BellRing className="size-3.5 text-accent" aria-hidden />
            12 subscriptions found · reminders ready for approval
          </div>
        </div>
      </div>

      <p className="relative text-xs text-white/60">© {new Date().getFullYear()} SubscriptIQ. All rights reserved.</p>
    </aside>
  );
}

function PreviewStat({
  icon,
  label,
  value,
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  trend: string;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70 [&>svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      <div className="mt-0.5 text-xs text-white/70">{trend}</div>
    </div>
  );
}
