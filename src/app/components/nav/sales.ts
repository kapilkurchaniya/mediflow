import { Banknote, Receipt, RotateCcw, Truck } from "lucide-react";
import type { NavItem } from "./types";

export const salesNav: NavItem[] = [
  { group: "operations", order: 10, href: "/dashboard/sales", label: "Sales & invoices", icon: Receipt, description: "View invoice history & print receipts", permission: "sale.view", retailOnly: true },
  { group: "operations", order: 15, href: "/dashboard/sales/returns", label: "Sale returns (Credit Notes)", icon: RotateCcw, description: "Manage customer returns & GST credit notes", permission: "sale.view", retailOnly: true },
  { group: "operations", order: 18, href: "/dashboard/sales/register", label: "Cash register (Shifts)", icon: Banknote, description: "Shift open/close, drawer count, X & Z reports", permission: "register.manage", retailOnly: true },
  { group: "operations", order: 19, href: "/dashboard/wholesale", label: "Wholesale Challan", icon: Truck, description: "B2B challan, route dispatch & e-Way threshold", permission: "sale.view" },
];
