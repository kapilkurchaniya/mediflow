import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_NAV_ITEMS, NAV, PALETTE_NAV_ITEMS, settingsItem } from "@/app/components/nav";
import { PERMISSIONS } from "@/lib/permissions";

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
});
