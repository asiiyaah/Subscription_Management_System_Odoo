import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row at the bottom (e.g. Cancel + Save). */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZES = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };

/**
 * Modal built on the native <dialog>: focus is trapped, Esc and backdrop click close it.
 * For forms, put the <form> inside `children` and give the submit button `form="<form id>"` in `footer`.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the close button; start on the first field instead.
      dialog.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl shadow-black/50",
        "backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        SIZES[size],
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-bold tracking-tight">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4.5" />
            </button>
          </div>

          {children && <div className="overflow-y-auto px-6 py-5">{children}</div>}

          {footer && (
            <div className="flex flex-wrap justify-end gap-2.5 border-t border-line px-6 py-4">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}
