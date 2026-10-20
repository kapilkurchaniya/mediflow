import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_NAV_ITEMS, NAV, PALETTE_NAV_ITEMS, settingsItem, visibleNav, visiblePaletteItems } from "@/app/components/nav";
import { PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";

describe("navigation config", () => {
  it("every link points at a page that exists (catches typos and deleted pages)", () => {
    const missing = PALETTE_NAV_ITEMS.map((i) => i.href.split("?")[0])
      .filter((href) => !existsSync(path.join("src/app", href, "page.tsx")));
    expect(missing).toEqual([]);
  });

  it("no two items share the same destination", () => {
    const hrefs = PALETTE_NAV_ITEMS.map((i) => i.href);
    expect(hrefs.filter((h, i) => hrefs.indexOf(h) !== i)).toEqual([]);
  });

  it("order is unique inside a group, so the layout is deterministic", () => {
    const keys = ALL_NAV_ITEMS.map((i) => `${i.group}:${i.order}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it("the sidebar omits palette-only quick links but the palette includes them", () => {
    const sidebar = NAV.flatMap((g) => g.items);
    expect(sidebar.some((i) => i.paletteOnly)).toBe(false);
    expect(PALETTE_NAV_ITEMS.filter((i) => i.paletteOnly).length).toBeGreaterThan(0);
  });

  it("Settings is pinned in the footer, not duplicated in the groups", () => {
    expect(NAV.flatMap((g) => g.items).some((i) => i.href === settingsItem.href)).toBe(false);
    expect(PALETTE_NAV_ITEMS).toContain(settingsItem);
  });

  it("every permission named by an item is a real permission", () => {
    const unknown = PALETTE_NAV_ITEMS.flatMap((i) => (i.permission && !(i.permission in PERMISSIONS) ? [i.permission] : []));
    expect(unknown).toEqual([]);
  });

  describe("hiding what a user may not use", () => {
    const permsOf = (key: string) => new Set<string>(SYSTEM_ROLES.find((r) => r.key === key)!.permissions);
    const hrefs = (perms: Set<string>) => visibleNav(perms).flatMap((g) => g.items.map((i) => i.href));

    it("the owner sees everything in the sidebar", () => {
      expect(hrefs(permsOf("owner"))).toEqual(NAV.flatMap((g) => g.items.map((i) => i.href)));
    });

    it("a cashier sees billing and lookups, not purchases, GST, accounting or settings", () => {
      const seen = hrefs(permsOf("cashier"));
      expect(seen).toContain("/dashboard/sales/pos");
      expect(seen).toContain("/dashboard/inventory");
      for (const hidden of ["/dashboard/purchases", "/dashboard/gst", "/dashboard/accounting", "/dashboard/settings/racks", "/dashboard/inventory/import"]) {
        expect(seen).not.toContain(hidden);
      }
    });

    it("a section with no visible items disappears, headings included", () => {
      const headings = visibleNav(permsOf("cashier")).map((g) => g.heading);
      expect(headings).not.toContain("GST & Tax");
      expect(headings).not.toContain("Finance");
    });

    it("no permissions at all means an empty menu, and the command palette follows suit", () => {
      expect(visibleNav(new Set())).toEqual([]);
      expect(visiblePaletteItems(new Set())).toEqual([]);
    });

    it("the palette hides quick links the user may not use", () => {
      const labels = visiblePaletteItems(permsOf("cashier")).map((i) => i.label);
      expect(labels).toContain("Add customer"); // cashiers have customer.manage
      expect(labels).not.toContain("Record purchase");
    });
  });

  it("a page's own permission check agrees with its menu item (so the menu never offers a dead end)", () => {
    const mismatches: string[] = [];
    for (const item of ALL_NAV_ITEMS) {
      if (!item.permission || item.href.includes("?")) continue;
      const dir = path.join("src/app", item.href);
      const guard = [path.join(dir, "page.tsx"), path.join(dir, "layout.tsx")]
        .filter(existsSync)
        .map((f) => readFileSync(f, "utf8").match(/requirePagePermission\("([^"]+)"\)/)?.[1])
        .find(Boolean);
      if (guard && guard !== item.permission) mismatches.push(`${item.href}: menu says ${item.permission}, page requires ${guard}`);
    }
    expect(mismatches).toEqual([]);
  });
});
