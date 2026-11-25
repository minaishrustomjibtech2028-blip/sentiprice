import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { SESSION_EXPIRED_EVENT, api, tokenStorage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { roleLabel } from "@/lib/roles";
import type { AuthResponse, LoginPayload, RegisterPayload, User } from "@/types/auth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  // Page refresh: if a token is stored, confirm it with /auth/me and hydrate the user.
  useEffect(() => {
    if (!tokenStorage.getAccessToken()) {
      setIsLoading(false);
      return;
    }
    api
      .get<User>("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {
        tokenStorage.clear();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // The API client fires this when a refresh token is rejected mid-session.
  useEffect(() => {
    function onExpired() {
      queryClient.clear();
      setUser(null);
      toast({
        kind: "warning",
        title: "Your session expired",
        message: "Please sign in again to continue.",
        dedupeKey: "session-expired",
      });
      navigate("/login", { replace: true });
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [navigate, queryClient, toast]);

  const login = useCallback(async (payload: LoginPayload) => {
    const { data } = await api.post<AuthResponse>("/auth/login", payload);
    // Drop anything cached by a previous session so one role never sees another role's data.
    queryClient.clear();
    tokenStorage.setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    return data.user;
  }, [queryClient]);

  const register = useCallback(async (payload: RegisterPayload) => {
    await api.post("/auth/register", payload);
    return login({ email: payload.email, password: payload.password });
  }, [login]);

  const logout = useCallback(() => {
    const name = user?.full_name;
    const role = user ? roleLabel(user.role) : "";
    tokenStorage.clear();
    // Clearing the cache matters: otherwise the next person to sign in on this
    // browser could briefly see the previous role's cached admin/analyst data.
    queryClient.clear();
    setUser(null);
    navigate("/login", { replace: true });
    toast({
      kind: "success",
      title: "Signed out",
      message: name ? `${name} (${role}) has been signed out safely.` : undefined,
      dedupeKey: "signed-out",
    });
  }, [navigate, queryClient, toast, user]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
