import type { RouteObject } from "react-router-dom";
import Dashboard from "./Dashboard";

// Owner: Frontend Member 1. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const dashboardRoutes: RouteObject[] = [{ index: true, element: <Dashboard /> }];
