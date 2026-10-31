import { cn } from "@/lib/cn";

export interface TabOption {
  value: string;
  label: string;
  /** Optional count shown in a pill, e.g. "Overdue 7". */
  count?: number;
}

interface TabsProps {
  tabs: TabOption[];
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
}

/** Status tabs above list pages (All · Draft · Active · …). Scrolls sideways on phones. */
export function Tabs({ tabs, value, onChange, "aria-label": ariaLabel }: TabsProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div role="tablist" aria-label={ariaLabel} className="flex w-max gap-1 rounded-2xl border border-line bg-surface/60 p-1">
        {tabs.map((tab) => {
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.value)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap transition",
                selected
                  ? "bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/25"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[11px] font-semibold",
                    selected ? "bg-white/25 text-white" : "bg-surface-2 text-muted",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
