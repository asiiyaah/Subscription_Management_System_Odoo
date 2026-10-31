import type { RouteObject } from "react-router-dom";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

// Owner: Frontend Member 1 — My Subscriptions (C2) and detail (C2a). Replace the placeholders.
// Paths are relative to /portal. Data: GET /api/portal/subscriptions (scoped to the signed-in customer).
export const portalSubscriptionRoutes: RouteObject[] = [
  { path: "subscriptions", element: <PagePlaceholder title="My subscriptions" owner="Member 1" /> },
  { path: "subscriptions/:id", element: <PagePlaceholder title="Subscription" owner="Member 1" /> },
];
