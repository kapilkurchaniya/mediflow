import { BookmarkCheck, Coins, Package, UserPlus, Users } from "lucide-react";
import type { NavItem } from "./types";

export const crmNav: NavItem[] = [
  { group: "operations", order: 20, href: "/dashboard/orders", label: "Omnichannel orders", icon: Package, permission: "sale.view" },
  { group: "operations", order: 40, href: "/dashboard/sales/promise-orders", label: "Promise orders", icon: BookmarkCheck, permission: "sale.view" },
  { group: "directory", order: 20, href: "/dashboard/customers", label: "Customers", icon: Users, description: "Directory & outstanding balances", permission: "customer.view" },
  { group: "directory", order: 21, href: "/dashboard/customers/new", label: "Add customer", icon: UserPlus, description: "Register patient or credit account", paletteOnly: true, permission: "customer.manage" },
  { group: "directory", order: 30, href: "/dashboard/customers/groups", label: "Family groups", icon: Users, permission: "customer.view" },
  { group: "directory", order: 40, href: "/dashboard/settings/medical-reps", label: "Medical reps (MR)", icon: Users, permission: "customer.view" },
  { group: "directory", order: 50, href: "/dashboard/settings/loyalty", label: "Loyalty rewards", icon: Coins, permission: "customer.manage" },
];
