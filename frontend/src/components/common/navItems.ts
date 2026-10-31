import {
  BarChart3,
  Bot,
  CreditCard,
  FileText,
  LayoutDashboard,
  Layers,
  Package,
  Repeat,
  TicketPercent,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types/auth";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: Role[];
}

const STAFF: Role[] = ["admin", "staff"];

// Sidebar order. Add an entry here when a new module gets a route.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, roles: STAFF },
  { label: "AI Assistant", to: "/assistant", icon: Bot, roles: STAFF },
  { label: "Subscriptions", to: "/subscriptions", icon: Repeat, roles: STAFF },
  { label: "Customers", to: "/customers", icon: Users, roles: STAFF },
  { label: "Products", to: "/products", icon: Package, roles: STAFF },
  { label: "Plans", to: "/plans", icon: Layers, roles: STAFF },
  { label: "Invoices", to: "/invoices", icon: FileText, roles: STAFF },
  { label: "Payments", to: "/payments", icon: CreditCard, roles: STAFF },
  { label: "Discounts", to: "/discounts", icon: TicketPercent, roles: STAFF },
  { label: "Reports", to: "/reports", icon: BarChart3, roles: STAFF },
];
