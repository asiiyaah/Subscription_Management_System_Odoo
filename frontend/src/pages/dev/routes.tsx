import type { RouteObject } from "react-router-dom";
import UiKit from "./UiKit";

// Dev-only pages (not in the sidebar, not in production builds).
export const devRoutes: RouteObject[] = [{ path: "ui-kit", element: <UiKit /> }];
