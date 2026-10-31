import type { RouteObject } from "react-router-dom";
import Customers from "./Customers";
import CustomerDetail from "./CustomerDetail";

// Owner: Frontend Member 1. Add this module's pages here — no need to touch AppRoutes.tsx.
export const customerRoutes: RouteObject[] = [
  { path: "customers", element: <Customers /> },
  { path: "customers/:id", element: <CustomerDetail /> },
];
