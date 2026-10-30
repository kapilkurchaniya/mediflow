import { AlertTriangle, Boxes, ClipboardCheck, Layers, Pill, ShieldAlert, Upload } from "lucide-react";
import type { NavItem } from "./types";

export const inventoryNav: NavItem[] = [
  { group: "inventory", order: 10, href: "/dashboard/inventory", label: "Item master", icon: Pill, exact: true, description: "Drug catalog, salts & HSN codes", permission: "medicine.view" },
  { group: "inventory", order: 20, href: "/dashboard/inventory/batches", label: "Batches & stock", icon: Boxes, description: "Expiry dates, MRP, cost & quantities", permission: "inventory.view" },
  { group: "inventory", order: 21, href: "/dashboard/inventory/batches?nearExpiry=true", label: "Near-expiry batches", icon: AlertTriangle, description: "Batches expiring within 90 days", paletteOnly: true, permission: "inventory.view" },
  { group: "inventory", order: 25, href: "/dashboard/inventory/quarantine", label: "Quarantine & expiry dump", icon: ShieldAlert, description: "Isolate expired stock & distributor debit claims", permission: "inventory.view" },
  { group: "inventory", order: 26, href: "/dashboard/inventory/stocktake", label: "Physical stocktake", icon: ClipboardCheck, description: "Shelf counts & rack audit sessions", permission: "inventory.view" },
  { group: "inventory", order: 30, href: "/dashboard/settings/racks", label: "Racks & shelves", icon: Layers, permission: "medicine.manage" },
  { group: "inventory", order: 50, href: "/dashboard/inventory/import", label: "Bulk import", icon: Upload, description: "Upload medicine stock via CSV/Excel", permission: "inventory.adjust" },
];
