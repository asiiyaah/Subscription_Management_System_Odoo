import { Repeat } from "lucide-react";
import { cn } from "@/lib/cn";

/** `light` is for use on the pink brand gradient, where the gradient "IQ" would disappear. */
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl shadow-lg",
          light ? "bg-white/15 ring-1 ring-white/30" : "bg-gradient-to-br from-primary to-accent shadow-primary/30",
        )}
      >
        <Repeat className="size-5 text-white" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="text-lg font-extrabold tracking-tight text-ink">
        Subscript
        <span
          className={cn(light ? "text-white/70" : "bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent")}
        >
          IQ
        </span>
      </span>
    </div>
  );
}
