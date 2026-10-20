import { Settings } from "lucide-react";
import type { NavItem } from "./types";

/** Pinned in the sidebar footer (not part of a group) and also offered in the command palette. */
export const settingsItem: NavItem = {
  group: "main",
  order: 999,
  href: "/dashboard/settings",
  label: "Settings",
  icon: Settings,
  description: "Store profile, GSTIN, printer & bills",
  permission: "settings.manage",
};
