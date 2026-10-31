import type { RouteObject } from "react-router-dom";
import Invoices from "./Invoices";

// Owner: Frontend Member 2. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const invoiceRoutes: RouteObject[] = [{ path: "invoices", element: <Invoices /> }];
