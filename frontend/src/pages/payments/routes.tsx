import type { RouteObject } from "react-router-dom";
import Payments from "./Payments";

// Owner: Frontend Member 2.
export const paymentRoutes: RouteObject[] = [{ path: "payments", element: <Payments /> }];
