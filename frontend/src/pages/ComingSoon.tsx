import { LogOut } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { useAuth } from "@/context/AuthContext";

/** Temporary landing page after login until the Dashboard and Portal are built. */
export default function ComingSoon({ area }: { area: string }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="rounded-3xl border border-line bg-surface p-8">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="mt-1 text-lg font-semibold">
          {user?.name} · <span className="capitalize text-primary">{user?.role}</span>
        </p>
        <p className="mt-4 text-muted">{area} is coming next.</p>
        <button
          onClick={logout}
          className="mx-auto mt-6 flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <LogOut className="size-4" aria-hidden /> Log out
        </button>
      </div>
    </div>
  );
}
