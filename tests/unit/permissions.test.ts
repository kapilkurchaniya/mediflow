import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";

const role = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!;

describe("permission catalogue and role templates", () => {
  it("every role template only names real permissions", () => {
    for (const r of SYSTEM_ROLES) {
      const unknown = r.permissions.filter((p) => !(p in PERMISSIONS));
      expect(unknown, `role ${r.key}`).toEqual([]);
    }
  });

  it("role keys are unique", () => {
    const keys = SYSTEM_ROLES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the owner can do everything", () => {
    expect([...role("owner").permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("a cashier can bill but cannot buy, adjust stock, see accounts, or change settings", () => {
    const p = new Set(role("cashier").permissions);
    expect(p.has("sale.create")).toBe(true);
    for (const denied of ["purchase.create", "inventory.adjust", "accounting.view", "settings.manage", "user.manage", "report.export", "sale.discount_override"] as const) {
      expect(p.has(denied), denied).toBe(false);
    }
  });

  it("a manager runs the store but cannot manage users, settings, stores or API keys", () => {
    const p = new Set(role("manager").permissions);
    expect(p.has("inventory.adjust")).toBe(true);
    for (const denied of ["user.manage", "settings.manage", "store.manage", "api_key.manage", "store.switch_any", "report.all_stores"] as const) {
      expect(p.has(denied), denied).toBe(false);
    }
  });

  it("the auditor is read-only: no create/post/adjust/manage permissions", () => {
    const writes = role("auditor").permissions.filter((p) => /\.(create|post|adjust|manage|cancel|return|approve|transfer)/.test(p));
    expect(writes).toEqual([]);
  });
});
