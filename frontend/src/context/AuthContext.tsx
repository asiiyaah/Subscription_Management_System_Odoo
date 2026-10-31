import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { authService } from "@/services/authService";
import { tokenStorage } from "@/lib/tokenStorage";
import type { LoginRequest, Role, User } from "@/types/auth";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest, remember: boolean) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => tokenStorage.getUser());

  const login = useCallback(async (credentials: LoginRequest, remember: boolean) => {
    const { access_token, user } = await authService.login(credentials);
    tokenStorage.save(access_token, user, remember);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

/** True for admins — use to hide create/edit/delete from staff (R27: only the admin manages discounts). */
export function useIsAdmin(): boolean {
  return useAuth().user?.role === "admin";
}

/** Where each role lands after login. */
export function homePathFor(role: Role): string {
  return role === "customer" ? "/portal" : "/";
}
