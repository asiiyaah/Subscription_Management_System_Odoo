import type { RouteObject } from "react-router-dom";
import AIAssistant from "./AIAssistant";

// Owner: Frontend Member 2. Add this module's pages here (e.g. a detail page) — no need to touch App.tsx.
export const aiRoutes: RouteObject[] = [{ path: "assistant", element: <AIAssistant /> }];
