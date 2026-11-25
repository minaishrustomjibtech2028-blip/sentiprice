import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/lib/auth-context";
import { ROLE_META } from "@/lib/roles";
import { useToast } from "@/lib/toast";
import type { Role } from "@/types/auth";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-amz-bg">
      <div className="flex flex-col items-center gap-3 text-amz-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amz-border border-t-amz-orange" />
        <span className="text-sm">Loading SentiPrice…</span>
      </div>
    </div>
  );
}

/** Blocks access unless signed in. Remembers where the user was heading so login can return there. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/**
 * Blocks access unless the user's role is in `roles`. Instead of silently bouncing,
 * it tells the user which role the page needs and which one they're signed in as.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const allowed = !!user && roles.includes(user.role);

  useEffect(() => {
    if (!isLoading && user && !allowed) {
      toast({
        kind: "warning",
        title: "Access restricted",
        message: `That page is for ${roles.map((r) => ROLE_META[r].label).join(" / ")} only. You're signed in as ${ROLE_META[user.role].label}.`,
        dedupeKey: `denied-${location.pathname}`,
      });
    }
  }, [isLoading, user, allowed, roles, toast, location.pathname]);

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
