import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password";
import { cn } from "@/lib/cn";

/** Live checklist that ticks each password rule as the user types (R3). */
export function PasswordRulesChecklist({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(password);
        return (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-2 text-xs transition-colors",
              passed ? "text-success" : "text-muted",
            )}
          >
            {passed ? (
              <Check className="size-3.5 shrink-0" strokeWidth={3} aria-hidden />
            ) : (
              <Circle className="size-3.5 shrink-0" aria-hidden />
            )}
            <span>
              {rule.label}
              <span className="sr-only">{passed ? " (met)" : " (not met)"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
