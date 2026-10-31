import { useId } from "react";
import { cn } from "@/lib/cn";

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}

/** Pick one of 2–4 options, e.g. Percentage / Fixed amount. */
export function SegmentedControl<T extends string>({ label, value, onChange, options }: SegmentedControlProps<T>) {
  const labelId = useId();
  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-sm font-medium text-ink">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex rounded-xl border border-line bg-surface-2/60 p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "h-9 flex-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition",
                selected
                  ? "bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/25"
                  : "text-muted hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
