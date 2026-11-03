import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/permissions";

/** Sidebar sections, in display order (see GROUPS in ./index.ts). */
export type NavGroupId = "main" | "operations" | "compliance" | "inventory" | "gst" | "finance" | "comms" | "directory";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: NavGroupId;
  /** Position inside the group (lower first). Use gaps of 10 so a new page needs no renumbering. */
  order: number;
  exact?: boolean;
  shortcut?: string;
  /** Second line in the command palette. */
  description?: string;
  /** Hide the item from users without this permission (enforced from Roadmap A1.3). */
  permission?: Permission;
  /** Shown only in the command palette (quick links such as "Add customer"), not in the sidebar. */
  paletteOnly?: boolean;
  /** Hidden when operating in warehouse mode (Task A3.5: retail counter sales only). */
  retailOnly?: boolean;
};
