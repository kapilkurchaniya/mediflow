import { ClipboardList, Clock, FileInput, RotateCcw, Tag, Truck } from "lucide-react";
import type { NavItem } from "./types";

export const purchasingNav: NavItem[] = [
  { group: "operations", order: 25, href: "/dashboard/purchases/orders", label: "Purchase orders", icon: ClipboardList, description: "Supplier purchase orders & procurement", permission: "purchase.view" },
  { group: "operations", order: 26, href: "/dashboard/purchases/orders/new", label: "New purchase order", icon: ClipboardList, description: "Draft a new purchase order", paletteOnly: true, permission: "purchase.create" },
  { group: "operations", order: 27, href: "/dashboard/purchases/reorder", label: "Reorder suggestions", icon: ClipboardList, description: "Automated stock replenishment suggestions", permission: "purchase.view" },
  { group: "operations", order: 28, href: "/dashboard/purchases/orders/central", label: "Central purchasing", icon: Truck, description: "Multi-branch split purchase orders", permission: "purchase.create" },
  { group: "operations", order: 30, href: "/dashboard/purchases", label: "Purchases (GRN)", icon: FileInput, description: "Goods received notes & supplier invoices", permission: "purchase.view" },
  { group: "operations", order: 31, href: "/dashboard/purchases/new", label: "Record purchase", icon: FileInput, description: "Post a new GRN entry", paletteOnly: true, permission: "purchase.create" },
  { group: "operations", order: 32, href: "/dashboard/purchases/returns", label: "Purchase returns", icon: RotateCcw, description: "Vendor debit notes & stock returns", permission: "purchase.return" },
  { group: "operations", order: 33, href: "/dashboard/purchases/returns/new", label: "New debit note", icon: RotateCcw, description: "Issue a purchase debit note", paletteOnly: true, permission: "purchase.return" },
  { group: "operations", order: 34, href: "/dashboard/purchases/expiry-returns", label: "Expiry returns", icon: Clock, description: "Near-expiry & expired stock return", permission: "purchase.return" },
  { group: "inventory", order: 40, href: "/dashboard/settings/schemes", label: "Trade schemes", icon: Tag, permission: "purchase.view" },
  { group: "directory", order: 10, href: "/dashboard/suppliers", label: "Suppliers", icon: Truck, description: "Wholesalers & distributors list", permission: "supplier.view" },
];
