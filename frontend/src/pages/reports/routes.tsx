import type { RouteObject } from "react-router-dom";
import Reports from "./Reports";

// Owner: Frontend Member 2. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const reportRoutes: RouteObject[] = [{ path: "reports", element: <Reports /> }];
