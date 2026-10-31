import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { Skeleton } from "@/components/common/States";

// Loaded on demand so the charts library isn't part of the first page load.
const Reports = lazy(() => import("./Reports"));

// Owner: Frontend Member 2.
export const reportRoutes: RouteObject[] = [
  {
    path: "reports",
    element: (
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <Reports />
      </Suspense>
    ),
  },
];
