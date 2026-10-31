import type { RouteObject } from "react-router-dom";
import Products from "./Products";

// Owner: Frontend Member 1. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const productRoutes: RouteObject[] = [{ path: "products", element: <Products /> }];
