import type { RouteObject } from "react-router-dom";
import Plans from "./Plans";

// Owner: Frontend Member 1. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const planRoutes: RouteObject[] = [{ path: "plans", element: <Plans /> }];
