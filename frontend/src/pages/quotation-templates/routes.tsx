import type { RouteObject } from "react-router-dom";
import QuotationTemplates from "./QuotationTemplates";
import QuotationTemplateDetail from "./QuotationTemplateDetail";

// Member 1 owns these routes; Member 2 must add them to AppRoutes.tsx and navItems.ts.
export const quotationTemplateRoutes: RouteObject[] = [
  { path: "quotation-templates", element: <QuotationTemplates /> },
  { path: "quotation-templates/:id", element: <QuotationTemplateDetail /> },
];
