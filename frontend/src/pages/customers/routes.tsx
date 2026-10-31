import type { RouteObject } from "react-router-dom";
import Customers from "./Customers";

// Owner: Frontend Member 1. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const customerRoutes: RouteObject[] = [{ path: "customers", element: <Customers /> }];
