import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right, e.g. <Button>+ New Customer</Button>. */
  actions?: ReactNode;
  /** Shows a back link above the title (detail pages). */
  back?: { to: string; label: string };
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <div className="mb-6 space-y-3">
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}
