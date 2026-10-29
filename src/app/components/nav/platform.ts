import { ScrollText } from "lucide-react";
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
];
