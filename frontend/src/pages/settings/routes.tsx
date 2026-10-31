import type { RouteObject } from "react-router-dom";
import Settings from "./Settings";

// Owner: Frontend Member 2. Admin and staff; the Business and Automation tabs are admin only.
export const settingsRoutes: RouteObject[] = [{ path: "settings", element: <Settings /> }];
