import { Banknote, Receipt, RotateCcw } from "lucide-react";
import type { NavItem } from "./types";

export const salesNav: NavItem[] = [
  { group: "operations", order: 10, href: "/dashboard/sales", label: "Sales & invoices", icon: Receipt, description: "View invoice history & print receipts", permission: "sale.view" },
  { group: "operations", order: 15, href: "/dashboard/sales/returns", label: "Sale returns (Credit Notes)", icon: RotateCcw, description: "Manage customer returns & GST credit notes", permission: "sale.view" },
  { group: "operations", order: 18, href: "/dashboard/sales/register", label: "Cash register (Shifts)", icon: Banknote, description: "Shift open/close, drawer count, X & Z reports", permission: "register.manage" },
];
