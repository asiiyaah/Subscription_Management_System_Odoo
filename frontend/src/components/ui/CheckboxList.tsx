import { useId } from "react";
import { Check } from "lucide-react";
import { Skeleton } from "@/components/common/States";
import { cn } from "@/lib/cn";
import type { Id } from "@/types/common";

interface CheckboxListProps {
  label: string;
  options: Array<{ id: Id; name: string }> | undefined;
  selected: Id[];
  onChange: (selected: Id[]) => void;
  error?: string;
}

/** Multi-select as a list of checkboxes (e.g. which products a rule applies to). */
export function CheckboxList({ label, options, selected, onChange, error }: CheckboxListProps) {
  const labelId = useId();

  function toggle(id: Id) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-sm font-medium text-ink">
        {label}
        {selected.length > 0 && <span className="ml-2 text-xs font-normal text-muted">{selected.length} selected</span>}
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        className={cn(
          "max-h-48 space-y-0.5 overflow-y-auto rounded-xl border bg-surface-2/40 p-1.5",
          error ? "border-danger/70" : "border-line",
        )}
      >
        {!options
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="m-1 h-8" />)
          : options.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition hover:bg-surface-2"
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(option.id)} className="peer sr-only" />
                  <span
                    className={cn(
                      "flex size-4.5 shrink-0 items-center justify-center rounded-md border transition",
                      "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
                      checked ? "border-transparent bg-gradient-to-br from-primary to-accent text-white" : "border-line bg-surface",
                    )}
                    aria-hidden
                  >
                    {checked && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  {option.name}
                </label>
              );
            })}
      </div>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
