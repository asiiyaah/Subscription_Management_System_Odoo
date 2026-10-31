import { Link, NavLink, Outlet } from "react-router-dom";
import { FileText, Home, LogOut, Repeat, UserRound, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { useAuth } from "@/context/AuthContext";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { cn } from "@/lib/cn";

const NAV: Array<{ label: string; to: string; icon: LucideIcon; end?: boolean }> = [
  { label: "Home", to: "/portal", icon: Home, end: true },
  { label: "My subscriptions", to: "/portal/subscriptions", icon: Repeat },
  { label: "My invoices", to: "/portal/invoices", icon: FileText },
  { label: "Profile", to: "/portal/profile", icon: UserRound },
];

/** Customer portal shell (R6): simple top navigation, no admin chrome. */
export default function PortalLayout() {
  const { user, logout } = useAuth();
  const business = useBusinessSettings();
  const initials = (user?.name ?? "")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/portal" aria-label="Customer portal home">
            <Logo />
          </Link>
          <nav aria-label="Portal" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((item) => (
              <PortalLink key={item.to} {...item} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/portal/profile" className="flex items-center gap-2.5 rounded-full border border-line bg-surface/70 py-1 pl-1 pr-3 hover:border-primary/50">
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-bold text-white">
                {initials}
              </span>
              <span className="hidden max-w-40 truncate text-sm font-semibold sm:block">{user?.name}</span>
            </Link>
            <button
              type="button"
              onClick={logout}
              aria-label="Log out"
              className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
        {/* Phones: the nav moves to its own scrollable row */}
        <nav aria-label="Portal" className="-mt-1 flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
          {NAV.map((item) => (
            <PortalLink key={item.to} {...item} />
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 print:p-0">
        <Outlet />
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted print:hidden">
        Questions about billing? Write to <span className="text-ink">{business.email}</span> or call {business.phone}.
      </footer>
    </div>
  );
}

function PortalLink({ label, to, icon: Icon, end }: { label: string; to: string; icon: LucideIcon; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition",
          isActive ? "bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/25" : "text-muted hover:bg-surface-2 hover:text-ink",
        )
      }
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </NavLink>
  );
}
