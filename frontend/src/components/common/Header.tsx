import { Bell, Menu, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useAuth();
  const initials = user?.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <label className="relative hidden max-w-md flex-1 sm:block">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          placeholder="Search customers, subscriptions, invoices…"
          className="h-10 w-full rounded-full border border-line bg-surface/70 pl-10 pr-4 text-sm placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20"
        />
      </label>

      <div className="ml-auto flex items-center gap-2">
        <button
          aria-label="Notifications"
          className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
        >
          <Bell className="size-5" />
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
        </button>
        <div className="flex items-center gap-2.5 rounded-full border border-line bg-surface/70 py-1 pl-1 pr-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-bold text-white">
            {initials}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-semibold">{user?.name}</span>
            <span className="block text-xs capitalize text-muted">{user?.role}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
