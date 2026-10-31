import type { RouteObject } from "react-router-dom";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import Users from "./Users";

// Owner: Frontend Member 2. Admin only — only the admin can add staff (R7).
export const userRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute roles={["admin"]} />,
    children: [{ path: "users", element: <Users /> }],
  },
];
