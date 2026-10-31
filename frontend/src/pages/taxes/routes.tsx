import type { RouteObject } from "react-router-dom";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import Taxes from "./Taxes";

// Owner: Frontend Member 2. Admin only (staff are redirected to the dashboard).
export const taxRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute roles={["admin"]} />,
    children: [{ path: "taxes", element: <Taxes /> }],
  },
];
