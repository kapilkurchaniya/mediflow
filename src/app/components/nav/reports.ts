import { BarChart3, Percent } from "lucide-react";
import type { NavItem } from "./types";

export const reportsNav: NavItem[] = [
  { group: "finance", order: 30, href: "/dashboard/reports", label: "Reports & Analytics", icon: BarChart3, permission: "report.view" },
  { group: "finance", order: 40, href: "/dashboard/reports/commissions", label: "MR commissions", icon: Percent, permission: "report.view" },
];
