import { BookmarkCheck, Coins, Package, UserPlus, Users } from "lucide-react";
import type { NavItem } from "./types";

export const crmNav: NavItem[] = [
  { group: "operations", order: 20, href: "/dashboard/orders", label: "Omnichannel orders", icon: Package, description: "Coming Soon — Unified WhatsApp, eRetail app & online pharmacy orders", permission: "sale.view", badge: "Soon" },
  { group: "operations", order: 40, href: "/dashboard/sales/promise-orders", label: "Promise orders", icon: BookmarkCheck, description: "Track customer requests for out-of-stock or special-order items", permission: "sale.view" },
  { group: "directory", order: 20, href: "/dashboard/customers", label: "Customers", icon: Users, description: "Directory & outstanding balances", permission: "customer.view" },
  { group: "directory", order: 21, href: "/dashboard/customers/new", label: "Add customer", icon: UserPlus, description: "Register patient or credit account", paletteOnly: true, permission: "customer.manage" },
  { group: "directory", order: 30, href: "/dashboard/customers/groups", label: "Family groups", icon: Users, permission: "customer.view" },
  { group: "directory", order: 40, href: "/dashboard/settings/medical-reps", label: "Medical reps (MR)", icon: Users, permission: "customer.view" },
  { group: "directory", order: 50, href: "/dashboard/settings/loyalty", label: "Loyalty rewards", icon: Coins, permission: "customer.manage" },
];
