import type { User } from "@/types/auth";

const TOKEN_KEY = "subscriptiq.token";
const USER_KEY = "subscriptiq.user";

// "Remember me" keeps the session in localStorage; otherwise it lasts for the tab only.
function storages(): Storage[] {
  return [localStorage, sessionStorage];
}

export const tokenStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  },

  getUser(): User | null {
    const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },

  save(token: string, user: User, remember: boolean): void {
    this.clear();
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
    store.setItem(USER_KEY, JSON.stringify(user));
  },

  clear(): void {
    for (const store of storages()) {
      store.removeItem(TOKEN_KEY);
      store.removeItem(USER_KEY);
    }
  },
};
