import { BarChart3, Percent, Scale } from "lucide-react";
import type { NavItem } from "./types";

export const reportsNav: NavItem[] = [
  { group: "finance", order: 25, href: "/dashboard/reports/chain", label: "Chain Overview", icon: BarChart3, description: "Consolidated multi-store revenue, branch ranking & margin comparison", permission: "report.all_stores" },
  { group: "finance", order: 30, href: "/dashboard/reports", label: "Reports & Analytics", icon: BarChart3, description: "Financial statements, fast/slow movers, expiry risk & ageing reports", permission: "report.view" },
  { group: "finance", order: 40, href: "/dashboard/reports/commissions", label: "MR commissions", icon: Percent, description: "Calculate & audit medical representative referral commissions", permission: "report.view" },
  { group: "finance", order: 45, href: "/dashboard/reports/pilot-reconcile", label: "Pilot Reconciliation", icon: Scale, description: "Daily ERP operational, stock & ledger reconciliation check", permission: "report.view" },
  { group: "finance", order: 46, href: "/dashboard/reports/tb-register", label: "TB Drug Register", icon: Scale, description: "Anti-TB Schedule H1 dispensing register", permission: "report.view", paletteOnly: true },
  { group: "finance", order: 47, href: "/dashboard/reports/patient-doctor", label: "Patient & Doctor Sales", icon: BarChart3, description: "Patient-wise, doctor-wise & doctor×company analytics", permission: "report.view", paletteOnly: true },
  { group: "finance", order: 48, href: "/dashboard/reports/business-analysis", label: "Business Analysis Pivot", icon: BarChart3, description: "Gross margin & COGS pivot by brand/category", permission: "report.view", paletteOnly: true },
  { group: "finance", order: 49, href: "/dashboard/reports/owner-pulse", label: "eOwner & Marg TCO", icon: BarChart3, description: "3-year TCO comparator & multi-store pulse", permission: "report.view", paletteOnly: true },
];
