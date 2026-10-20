/**
 * Single source of truth for navigation. The sidebar and the command palette both read from here.
 *
 * To add a page: add one entry to YOUR module's file in this folder (group + order + href + label + icon).
 * To add a module: create nav/<module>.ts and add it to MODULE_NAV below (one line).
 */
import { accountingNav } from "./accounting";
import { commsNav } from "./comms";
import { complianceNav } from "./compliance";
import { crmNav } from "./crm";
import { gstNav } from "./gst";
import { inventoryNav } from "./inventory";
import { mainNav } from "./main";
import { purchasingNav } from "./purchasing";
import { reportsNav } from "./reports";
import { salesNav } from "./sales";
import { settingsItem } from "./settings";
import type { NavGroupId, NavItem } from "./types";

export type { NavGroupId, NavItem } from "./types";
export { settingsItem } from "./settings";

const GROUPS: { id: NavGroupId; heading?: string }[] = [
  { id: "main" },
  { id: "operations", heading: "Operations" },
  { id: "compliance", heading: "Compliance (Rx)" },
  { id: "inventory", heading: "Inventory" },
  { id: "gst", heading: "GST & Tax" },
  { id: "finance", heading: "Finance" },
  { id: "comms", heading: "Comms & Alerts" },
  { id: "directory", heading: "Directory" },
];

const MODULE_NAV: NavItem[][] = [
  mainNav,
  salesNav,
  inventoryNav,
  purchasingNav,
  crmNav,
  complianceNav,
  gstNav,
  accountingNav,
  reportsNav,
  commsNav,
];

const groupIndex = (id: NavGroupId) => GROUPS.findIndex((g) => g.id === id);

/** Every item (sidebar + palette-only), sorted by group then order. */
export const ALL_NAV_ITEMS: NavItem[] = MODULE_NAV.flat().sort(
  (a, b) => groupIndex(a.group) - groupIndex(b.group) || a.order - b.order,
);

/** Sidebar structure: ordered sections with their items. */
export const NAV: { heading?: string; items: NavItem[] }[] = GROUPS.map((g) => ({
  heading: g.heading,
  items: ALL_NAV_ITEMS.filter((i) => i.group === g.id && !i.paletteOnly),
})).filter((g) => g.items.length > 0);

/** Everything the command palette can jump to. */
export const PALETTE_NAV_ITEMS: NavItem[] = [...ALL_NAV_ITEMS, settingsItem];

/** Sidebar sections with only the items this user may use (items without a `permission` are always shown). */
export function visibleNav(permissions: ReadonlySet<string>): typeof NAV {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || permissions.has(i.permission)),
  })).filter((g) => g.items.length > 0);
}

/** Command-palette destinations this user may use. */
export function visiblePaletteItems(permissions: ReadonlySet<string>): NavItem[] {
  return PALETTE_NAV_ITEMS.filter((i) => !i.permission || permissions.has(i.permission));
}
