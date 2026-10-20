import { FileInput, Tag, Truck } from "lucide-react";
import type { NavItem } from "./types";

export const purchasingNav: NavItem[] = [
  { group: "operations", order: 30, href: "/dashboard/purchases", label: "Purchases (GRN)", icon: FileInput, description: "Goods received notes & supplier invoices", permission: "purchase.view" },
  { group: "operations", order: 31, href: "/dashboard/purchases/new", label: "Record purchase", icon: FileInput, description: "Post a new GRN entry", paletteOnly: true, permission: "purchase.create" },
  { group: "inventory", order: 40, href: "/dashboard/settings/schemes", label: "Trade schemes", icon: Tag, permission: "purchase.view" },
  { group: "directory", order: 10, href: "/dashboard/suppliers", label: "Suppliers", icon: Truck, description: "Wholesalers & distributors list", permission: "supplier.view" },
];
