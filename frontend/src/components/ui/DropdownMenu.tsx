import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}

/**
 * "⋯" button that opens a list of actions. The menu is position: fixed,
 * so it isn't clipped by scrolling table containers.
 */
export function DropdownMenu({ actions, label = "Actions" }: { actions: MenuAction[]; label?: string }) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (actions.length === 0) return null;

  function toggle() {
    if (open) return setPosition(null);
    const rect = buttonRef.current!.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <MoreHorizontal className="size-4.5" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: position.top, right: position.right }}
          onClick={(event) => event.stopPropagation()}
          className="fixed z-50 min-w-44 rounded-xl border border-line bg-surface p-1.5 shadow-2xl shadow-black/50"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setPosition(null);
                action.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition [&>svg]:size-4",
                "disabled:cursor-not-allowed disabled:opacity-40",
                action.tone === "danger"
                  ? "text-danger hover:bg-danger/10 focus:bg-danger/10"
                  : "text-ink hover:bg-surface-2 focus:bg-surface-2",
                "focus:outline-none",
              )}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
