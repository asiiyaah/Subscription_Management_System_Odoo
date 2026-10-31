import type { RouteObject } from "react-router-dom";
import Payments from "./Payments";

// Owner: Frontend Member 2. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const paymentRoutes: RouteObject[] = [{ path: "payments", element: <Payments /> }];
