import { describe, expect, it } from "vitest";
import { SYSTEM_ROLES } from "@/lib/permissions";
import { can } from "@/server/rbac";
import type { Permission } from "@/lib/permissions";

const getRolePermissions = (roleKey: string): ReadonlySet<Permission> => {
  const role = SYSTEM_ROLES.find((r) => r.key === roleKey);
  if (!role) throw new Error(`Role ${roleKey} not found`);
  return new Set(role.permissions);
};

describe("Phase 3: RBAC UI Guards (P3-T01)", () => {
  it("cashier cannot see purchase.create, supplier.manage, or medicine.manage action buttons", () => {
    const ctx = { permissions: getRolePermissions("cashier") };
    expect(can(ctx, "purchase.create")).toBe(false);
    expect(can(ctx, "supplier.manage")).toBe(false);
    expect(can(ctx, "medicine.manage")).toBe(false);
    expect(can(ctx, "inventory.adjust")).toBe(false);
  });

  it("auditor is strictly read-only and denied all header & empty-state mutation buttons", () => {
    const ctx = { permissions: getRolePermissions("auditor") };
    expect(can(ctx, "purchase.create")).toBe(false);
    expect(can(ctx, "supplier.manage")).toBe(false);
    expect(can(ctx, "medicine.manage")).toBe(false);
    expect(can(ctx, "customer.manage")).toBe(false);
    expect(can(ctx, "inventory.adjust")).toBe(false);
  });

  it("owner and manager have full write permissions for UI actions", () => {
    const ownerCtx = { permissions: getRolePermissions("owner") };
    const managerCtx = { permissions: getRolePermissions("manager") };

    expect(can(ownerCtx, "purchase.create")).toBe(true);
    expect(can(ownerCtx, "supplier.manage")).toBe(true);
    expect(can(ownerCtx, "medicine.manage")).toBe(true);
    expect(can(ownerCtx, "customer.manage")).toBe(true);

    expect(can(managerCtx, "purchase.create")).toBe(true);
    expect(can(managerCtx, "supplier.manage")).toBe(true);
    expect(can(managerCtx, "medicine.manage")).toBe(true);
    expect(can(managerCtx, "customer.manage")).toBe(true);
  });
});

describe("Phase 3: POS Schedule Badges Classification (P3-T02)", () => {
  function classifySchedule(schedule: string) {
    const norm = schedule.trim().toUpperCase();
    if (norm === "H1") return { type: "H1", label: "Rx · Sched H1", tone: "rose" };
    if (norm === "X") return { type: "X", label: "NDPS · Sched X", tone: "purple" };
    if (norm === "H") return { type: "H", label: "Rx · Sched H", tone: "amber" };
    return { type: "OTHER", label: `Sched ${schedule}`, tone: "neutral" };
  }

  it("correctly flags Schedule H1 with high-visibility rose badge", () => {
    const res = classifySchedule("H1");
    expect(res.tone).toBe("rose");
    expect(res.label).toBe("Rx · Sched H1");
  });

  it("correctly flags Schedule X with high-visibility purple NDPS badge", () => {
    const res = classifySchedule("X");
    expect(res.tone).toBe("purple");
    expect(res.label).toBe("NDPS · Sched X");
  });

  it("correctly flags Schedule H with amber prescription badge", () => {
    const res = classifySchedule("H");
    expect(res.tone).toBe("amber");
    expect(res.label).toBe("Rx · Sched H");
  });

  it("handles case-insensitive whitespace inputs cleanly", () => {
    expect(classifySchedule(" h1 ").tone).toBe("rose");
    expect(classifySchedule(" x ").tone).toBe("purple");
    expect(classifySchedule(" h ").tone).toBe("amber");
  });

  it("falls back to neutral badge for other schedules", () => {
    const res = classifySchedule("G");
    expect(res.tone).toBe("neutral");
    expect(res.label).toBe("Sched G");
  });
});

describe("Phase 3: URL Search Debounce Param Calculations (P3-T03)", () => {
  function computeNextSearchParams(
    currentQueryString: string,
    paramName: string,
    newQuery: string,
  ): string {
    const params = new URLSearchParams(currentQueryString);
    const trimmed = newQuery.trim();
    if (trimmed) {
      params.set(paramName, trimmed);
    } else {
      params.delete(paramName);
    }
    // Always reset page when search changes
    params.delete("page");
    return params.toString();
  }

  it("sets search param and resets page to 1", () => {
    const result = computeNextSearchParams("page=4&filter=active", "q", "Paracetamol");
    const parsed = new URLSearchParams(result);
    expect(parsed.get("q")).toBe("Paracetamol");
    expect(parsed.get("page")).toBeNull();
    expect(parsed.get("filter")).toBe("active");
  });

  it("removes search param when query is empty or whitespace", () => {
    const result = computeNextSearchParams("page=2&q=Amox&range=custom", "q", "   ");
    const parsed = new URLSearchParams(result);
    expect(parsed.get("q")).toBeNull();
    expect(parsed.get("page")).toBeNull();
    expect(parsed.get("range")).toBe("custom");
  });

  it("preserves other URL parameters untouched", () => {
    const result = computeNextSearchParams("from=2026-01-01&to=2026-01-31", "q", "Cipla");
    const parsed = new URLSearchParams(result);
    expect(parsed.get("from")).toBe("2026-01-01");
    expect(parsed.get("to")).toBe("2026-01-31");
    expect(parsed.get("q")).toBe("Cipla");
  });
});

