import { Navigate, useRoutes } from "react-router-dom";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import AdminLayout from "@/layouts/AdminLayout";
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import SetPassword from "@/pages/auth/SetPassword";
import VerifyEmail from "@/pages/auth/VerifyEmail";
import PortalLayout from "@/layouts/PortalLayout";

// Member 1 modules
import { dashboardRoutes } from "@/pages/dashboard/routes";
import { customerRoutes } from "@/pages/customers/routes";
import { productRoutes } from "@/pages/products/routes";
import { planRoutes } from "@/pages/plans/routes";
import { subscriptionRoutes } from "@/pages/subscriptions/routes";

// Member 2 modules
import { invoiceRoutes } from "@/pages/invoices/routes";
import { paymentRoutes } from "@/pages/payments/routes";
import { discountRoutes } from "@/pages/discounts/routes";
import { taxRoutes } from "@/pages/taxes/routes";
import { aiRoutes } from "@/pages/ai/routes";
import { reportRoutes } from "@/pages/reports/routes";
import { userRoutes } from "@/pages/users/routes";
import { settingsRoutes } from "@/pages/settings/routes";
import { portalRoutes } from "@/pages/portal/routes";

// Member 1 — customer portal subscriptions
import { portalSubscriptionRoutes } from "@/pages/portal/subscriptions/routes";

import { devRoutes } from "@/pages/dev/routes";

export function AppRoutes() {
  return useRoutes([
    // Public
    { path: "/login", element: <Login /> },
    { path: "/signup", element: <Signup /> },
    { path: "/forgot-password", element: <ForgotPassword /> },
    { path: "/reset-password", element: <ResetPassword /> },
    { path: "/accept-invite", element: <ResetPassword invite /> },
    { path: "/verify-email", element: <VerifyEmail /> },
    // Signed in with a temporary password (outside ProtectedRoute, which redirects here).
    { path: "/set-password", element: <SetPassword /> },

    // Admin & staff — every module's routes render inside AdminLayout
    {
      element: <ProtectedRoute roles={["admin", "staff"]} />,
      children: [
        {
          path: "/",
          element: <AdminLayout />,
          children: [
            ...dashboardRoutes,
            ...customerRoutes,
            ...productRoutes,
            ...planRoutes,
            ...subscriptionRoutes,
            ...invoiceRoutes,
            ...paymentRoutes,
            ...discountRoutes,
            ...taxRoutes,
            ...aiRoutes,
            ...reportRoutes,
            ...userRoutes,
            ...settingsRoutes,
            ...(import.meta.env.DEV ? devRoutes : []),
          ],
        },
      ],
    },

    // Customer portal
    {
      element: <ProtectedRoute roles={["customer"]} />,
      children: [
        {
          path: "/portal",
          element: <PortalLayout />,
          children: [...portalRoutes, ...portalSubscriptionRoutes],
        },
      ],
    },

    { path: "*", element: <Navigate to="/" replace /> },
  ]);
}
