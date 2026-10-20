import { BookOpenText, Building2 } from "lucide-react";
import type { NavItem } from "./types";

export const accountingNav: NavItem[] = [
  { group: "finance", order: 10, href: "/dashboard/accounting", label: "Accounting", icon: BookOpenText, description: "Day book, ledgers & tax summaries", permission: "accounting.view" },
  { group: "finance", order: 20, href: "/dashboard/accounting/bank-reconciliation", label: "Bank reconciliation", icon: Building2, permission: "accounting.view" },
];
