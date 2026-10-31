import { BarChart3, Clock, FileText, Users, type LucideIcon } from "lucide-react";

const GROUPS: Array<{ title: string; icon: LucideIcon; prompts: string[] }> = [
  { title: "Insights", icon: BarChart3, prompts: ["What is our MRR?", "Which plan generates the most revenue?"] },
  { title: "Renewals", icon: Clock, prompts: ["Which subscriptions expire this week?", "Prepare renewal reminders"] },
  { title: "Billing", icon: FileText, prompts: ["Generate invoices for subscriptions due today", "Show overdue invoices"] },
  { title: "Customers", icon: Users, prompts: ["Which customers owe us the most?", "Show expiring in the next 30 days"] },
];

/** Starter questions shown before the first message. */
export function SuggestedPrompts({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {GROUPS.map(({ title, icon: Icon, prompts }) => (
        <section key={title} className="rounded-2xl border border-line bg-surface/60 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Icon className="size-3.5 text-primary" aria-hidden /> {title}
          </h3>
          <ul className="mt-2.5 space-y-1.5">
            {prompts.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  onClick={() => onPick(prompt)}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink transition hover:bg-surface-2"
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
