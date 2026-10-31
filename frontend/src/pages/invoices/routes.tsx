import type { RouteObject } from "react-router-dom";
import Invoices from "./Invoices";
import InvoiceDetail from "./InvoiceDetail";

// Owner: Frontend Member 2.
export const invoiceRoutes: RouteObject[] = [
  { path: "invoices", element: <Invoices /> },
  { path: "invoices/:id", element: <InvoiceDetail /> },
];
