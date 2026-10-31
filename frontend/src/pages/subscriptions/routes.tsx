import type { RouteObject } from "react-router-dom";
import Subscriptions from "./Subscriptions";

// Owner: Frontend Member 1. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const subscriptionRoutes: RouteObject[] = [{ path: "subscriptions", element: <Subscriptions /> }];
