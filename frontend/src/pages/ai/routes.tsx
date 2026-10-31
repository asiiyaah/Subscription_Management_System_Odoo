import type { RouteObject } from "react-router-dom";
import AIAssistant from "./AIAssistant";

// Owner: Frontend Member 2.
export const aiRoutes: RouteObject[] = [{ path: "assistant", element: <AIAssistant /> }];
