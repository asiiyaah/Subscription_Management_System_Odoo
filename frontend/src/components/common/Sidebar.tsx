import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { NAV_ITEMS } from "@/components/common/navItems";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const items = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));

  return (
    <nav
      aria-label="Main"
      className="flex h-full w-64 flex-col bg-gradient-to-b from-magenta via-[#b5179e] to-[#6a1280] px-4 py-6"
    >
      <div className="px-2">
        <Logo light />
      </div>

      <ul className="mt-8 flex-1 space-y-1 overflow-y-auto">
        {items.map(({ label, to, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-white text-magenta shadow-lg shadow-black/20"
                    : "text-white/80 hover:bg-white/10 hover:text-white",
                )
              }
            >
              <Icon className="size-4.5 shrink-0" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <button
        onClick={logout}
        className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <LogOut className="size-4.5" aria-hidden />
        Log out
      </button>
    </nav>
  );
}
