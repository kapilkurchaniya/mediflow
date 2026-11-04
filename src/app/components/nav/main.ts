import { LayoutGrid, ScanLine } from "lucide-react";
import type { NavItem } from "./types";

export const mainNav: NavItem[] = [
  { group: "main", order: 10, href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true, description: "Dashboard KPIs & recent activity", permission: "dashboard.view" },
  { group: "main", order: 20, href: "/dashboard/sales/pos", label: "New bill", icon: ScanLine, shortcut: "F2", description: "High-speed retail counter billing (POS)", permission: "sale.create", retailOnly: true },
];
