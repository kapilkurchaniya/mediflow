import { BarChart3, Percent, Scale } from "lucide-react";
import type { NavItem } from "./types";

export const reportsNav: NavItem[] = [
  { group: "finance", order: 25, href: "/dashboard/reports/chain", label: "Chain Overview", icon: BarChart3, description: "Consolidated multi-store revenue, branch ranking & margin comparison", permission: "report.all_stores" },
  { group: "finance", order: 30, href: "/dashboard/reports", label: "Reports & Analytics", icon: BarChart3, description: "Financial statements, fast/slow movers, expiry risk & ageing reports", permission: "report.view" },
  { group: "finance", order: 40, href: "/dashboard/reports/commissions", label: "MR commissions", icon: Percent, description: "Calculate & audit medical representative referral commissions", permission: "report.view" },
  { group: "finance", order: 45, href: "/dashboard/reports/pilot-reconcile", label: "Pilot Reconciliation", icon: Scale, description: "Daily ERP operational, stock & ledger reconciliation check", permission: "report.view" },
];
