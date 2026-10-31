import type { RouteObject } from "react-router-dom";
import PortalHome from "./PortalHome";
import MyInvoices from "./MyInvoices";
import MyInvoiceDetail from "./MyInvoiceDetail";
import MyProfile from "./MyProfile";

// Owner: Frontend Member 2. Paths are relative to /portal.
export const portalRoutes: RouteObject[] = [
  { index: true, element: <PortalHome /> },
  { path: "invoices", element: <MyInvoices /> },
  { path: "invoices/:id", element: <MyInvoiceDetail /> },
  { path: "profile", element: <MyProfile /> },
];
