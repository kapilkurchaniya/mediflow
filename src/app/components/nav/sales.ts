import { Receipt } from "lucide-react";
import type { NavItem } from "./types";

export const salesNav: NavItem[] = [
  { group: "operations", order: 10, href: "/dashboard/sales", label: "Sales & invoices", icon: Receipt, description: "View invoice history & print receipts", permission: "sale.view" },
];
