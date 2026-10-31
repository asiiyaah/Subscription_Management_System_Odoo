import { Navigate, Outlet, useLocation } from "react-router-dom";
import { homePathFor, useAuth } from "@/context/AuthContext";
import type { Role } from "@/types/auth";

/** Requires login; optionally limits access to certain roles (R5). */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Signed in with a temporary password: nothing else until they choose their own.
  if (user.must_change_password) {
    return <Navigate to="/set-password" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  return <Outlet />;
}
