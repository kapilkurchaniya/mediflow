import { ScrollText, ShieldCheck, UserCog } from "lucide-react";
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
];
