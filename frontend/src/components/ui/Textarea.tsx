import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className, id, rows = 3, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "w-full resize-y rounded-xl border bg-surface-2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition",
          "focus:border-primary focus:bg-surface-2 focus:outline-none focus:ring-3 focus:ring-primary/20",
          error ? "border-danger/70" : "border-line",
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
