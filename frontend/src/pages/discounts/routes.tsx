import type { RouteObject } from "react-router-dom";
import Discounts from "./Discounts";

// Owner: Frontend Member 2. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const discountRoutes: RouteObject[] = [{ path: "discounts", element: <Discounts /> }];
