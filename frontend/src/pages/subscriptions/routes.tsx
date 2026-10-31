import type { RouteObject } from "react-router-dom";
import Subscriptions from "./Subscriptions";
import SubscriptionEditor from "@/components/subscriptions/SubscriptionEditor";
import SubscriptionDetail from "./SubscriptionDetail";

// Owner: Frontend Member 1. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const subscriptionRoutes: RouteObject[] = [
  { path: "subscriptions", element: <Subscriptions /> },
  { path: "subscriptions/new", element: <SubscriptionEditor /> },
  { path: "subscriptions/:id/edit", element: <SubscriptionEditor /> },
  { path: "subscriptions/:id", element: <SubscriptionDetail /> },
];
