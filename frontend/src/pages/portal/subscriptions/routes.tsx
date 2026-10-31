import type { RouteObject } from "react-router-dom";
import MySubscriptions from "./MySubscriptions";
import MySubscriptionDetail from "./MySubscriptionDetail";

export const portalSubscriptionRoutes: RouteObject[] = [
  { path: "subscriptions", element: <MySubscriptions /> },
  { path: "subscriptions/:id", element: <MySubscriptionDetail /> },
];
