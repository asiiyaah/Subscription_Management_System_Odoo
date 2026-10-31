import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  error?: string;
  hint?: ReactNode;
  /** Adds a show/hide toggle and starts as type="password". */
  revealable?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, icon, error, hint, revealable = false, type = "text", className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const [revealed, setRevealed] = useState(false);
  const inputType = revealable ? (revealed ? "text" : "password") : type;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint}
      </div>

      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted [&>svg]:size-4.5">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "h-11 w-full rounded-xl border bg-surface-2/60 text-sm text-ink placeholder:text-muted/60 transition",
            "focus:border-primary focus:bg-surface-2 focus:outline-none focus:ring-3 focus:ring-primary/20",
            icon ? "pl-10" : "pl-3.5",
            revealable ? "pr-11" : "pr-3.5",
            error ? "border-danger/70" : "border-line",
          )}
          {...props}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
          >
            {revealed ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
          </button>
        )}
      </div>

      {error && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
