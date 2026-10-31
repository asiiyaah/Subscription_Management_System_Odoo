import type { RouteObject } from "react-router-dom";
import Discounts from "./Discounts";

// Owner: Frontend Member 2. Staff can view; only admins see create/edit/delete (R27).
export const discountRoutes: RouteObject[] = [{ path: "discounts", element: <Discounts /> }];
