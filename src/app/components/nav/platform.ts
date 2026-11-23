import { Monitor, Printer, ScrollText, ShieldCheck, Store, UserCog } from "lucide-react";
import type { NavItem } from "./types";

/** Platform pages (Lane A): audit log, and later users / stores. */
export const platformNav: NavItem[] = [
  {
    group: "finance",
    order: 50,
    href: "/dashboard/settings/audit",
    label: "Audit log",
    icon: ScrollText,
    description: "Who changed what, and when",
    permission: "audit.view",
  },
  {
    group: "directory",
    order: 60,
    href: "/dashboard/settings/users",
    label: "Staff & access",
    icon: UserCog,
    description: "Invite staff, set roles and branch access",
    permission: "user.manage",
  },
  {
    group: "directory",
    order: 61,
    href: "/dashboard/settings/roles",
    label: "Roles & permissions",
    icon: ShieldCheck,
    description: "What each role may do",
    permission: "user.manage",
  },
  {
    group: "directory",
    order: 62,
    href: "/dashboard/settings/stores",
    label: "Stores & Warehouses",
    icon: Store,
    description: "Manage pharmacy branches and distribution hubs",
    permission: "store.manage",
  },
  {
    group: "directory",
    order: 63,
    href: "/dashboard/settings/devices",
    label: "Billing Terminals",
    icon: Monitor,
    description: "Manage counter workstations & offline device tokens",
    permission: "settings.manage",
  },
  {
    group: "directory",
    order: 64,
    href: "/dashboard/settings/printers",
    label: "Billing Templates & Printers",
    icon: Printer,
    description: "Create custom HTML / OCR invoice templates and choose default vs custom",
    permission: "settings.manage",
  },
];
