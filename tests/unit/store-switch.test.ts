import { describe, expect, it } from "vitest";
import type { DbOrTx } from "@/server/db";
import {
  switchStore,
  listAllowedStores,
  type AllowedStoreItem,
} from "@/server/domain/stores/switch-service";
import { DomainError, ForbiddenError, NotFoundError } from "@/server/errors";

describe("Store Switcher Unit Tests (Task A3.2)", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const userId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "sess_test_12345";
  const storeAId = "33333333-3333-4333-8333-333333333333";
  const storeBId = "44444444-4444-4444-8444-444444444444";
  const inactiveStoreId = "55555555-5555-4555-8555-555555555555";
  const foreignStoreId = "66666666-6666-4666-8666-666666666666";

  const mockStores = [
    {
      id: storeAId,
      name: "Main Branch",
      code: "MAIN",
      kind: "retail" as const,
      stateCode: "29",
      gstin: "29ABCDE1234F1Z5",
      isActive: true,
      tenantId,
    },
    {
      id: storeBId,
      name: "Central Godown",
      code: "WH01",
      kind: "warehouse" as const,
      stateCode: "29",
      gstin: "29ABCDE1234F1Z5",
      isActive: true,
      tenantId,
    },
    {
      id: inactiveStoreId,
      name: "Closed Branch",
      code: "OLD1",
      kind: "retail" as const,
      stateCode: "29",
      gstin: null,
      isActive: false,
      tenantId,
    },
    {
      id: foreignStoreId,
      name: "Other Tenant Store",
      code: "OTH1",
      kind: "retail" as const,
      stateCode: "29",
      gstin: null,
      isActive: true,
      tenantId: "99999999-9999-4999-8999-999999999999",
    },
  ];

  function createMockDb(options: {
    membership?: {
      id: string;
      tenantId: string;
      userId: string;
      roleId: string;
      status: string;
      allStores: boolean;
      storeIds: string[];
      lastStoreId: string | null;
    } | null;
    hasSwitchAny?: boolean;
    stores?: typeof mockStores;
  }) {
    const stores = options.stores ?? mockStores;
    const membership =
      options.membership !== undefined
        ? options.membership
        : {
            id: "mem_1",
            tenantId,
            userId,
            roleId: "role_admin",
            status: "active",
            allStores: true,
            storeIds: [],
            lastStoreId: storeAId,
          };

    const auditWrites: unknown[] = [];
    const sessionUpdates: { sessionId: string; storeId: string }[] = [];
    const membershipUpdates: { id: string; lastStoreId: string }[] = [];

    const mockDb = {
      select: (fields?: unknown) => {
        const createQuery = () => ({
          where: (whereClause: unknown) => {
            const execute = async () => {
              // Target store query
              if (
                fields &&
                typeof fields === "object" &&
                "id" in fields &&
                "code" in fields &&
                "kind" in fields
              ) {
                // Could be target store in switchStore or list in listAllowedStores
                return stores;
              }
              // Role permissions query
              if (fields && typeof fields === "object" && "n" in fields) {
                return [{ n: options.hasSwitchAny ? 1 : 0 }];
              }
              // Joined membership and switchAnyPerm query
              if (
                fields &&
                typeof fields === "object" &&
                "membership" in fields
              ) {
                return membership
                  ? [
                      {
                        membership,
                        switchAnyPerm: options.hasSwitchAny ? "store.switch_any" : null,
                      },
                    ]
                  : [];
              }
              // Membership query
              return membership ? [membership] : [];
            };

            return {
              limit: async (n: number) => {
                const res = await execute();
                return res.slice(0, n);
              },
              orderBy: async () => execute(),
              execute,
              then: (resolve: (val: unknown) => void, reject?: (reason: unknown) => void) =>
                execute().then(resolve, reject),
            };
          },
        });

        return {
          from: (table: unknown) => ({
            ...createQuery(),
            leftJoin: () => createQuery(),
          }),
        };
      },
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async (whereClause: unknown) => {
            if ("lastStoreId" in values) {
              membershipUpdates.push({
                id: membership?.id ?? "",
                lastStoreId: values.lastStoreId as string,
              });
            }
            if ("storeId" in values) {
              sessionUpdates.push({
                sessionId,
                storeId: values.storeId as string,
              });
            }
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: async (data: unknown) => {
          auditWrites.push(data);
        },
      }),
      _auditWrites: auditWrites,
      _sessionUpdates: sessionUpdates,
      _membershipUpdates: membershipUpdates,
    };

    return mockDb;
  }

  it("successfully switches to a retail store for an allStores user", async () => {
    const db = createMockDb({
      stores: [mockStores[0]], // storeA
    });

    const res = await switchStore(db as unknown as DbOrTx, {
      sessionId,
      userId,
      tenantId,
      targetStoreId: storeAId,
      currentStoreId: storeBId,
    });

    expect(res.ok).toBe(true);
    expect(res.storeId).toBe(storeAId);
    expect(res.storeName).toBe("Main Branch");
    expect(res.storeCode).toBe("MAIN");
    expect(res.kind).toBe("retail");
    expect(db._sessionUpdates[0]?.storeId).toBe(storeAId);
    expect(db._membershipUpdates[0]?.lastStoreId).toBe(storeAId);
    expect(db._auditWrites.length).toBe(1);
  });

  it("successfully switches to a warehouse location", async () => {
    const db = createMockDb({
      stores: [mockStores[1]], // storeB warehouse
    });

    const res = await switchStore(db as unknown as DbOrTx, {
      sessionId,
      userId,
      tenantId,
      targetStoreId: storeBId,
      currentStoreId: storeAId,
    });

    expect(res.ok).toBe(true);
    expect(res.storeId).toBe(storeBId);
    expect(res.kind).toBe("warehouse");
    expect(db._sessionUpdates[0]?.storeId).toBe(storeBId);
  });

  it("rejects non-existent target store with NotFoundError", async () => {
    const db = createMockDb({
      stores: [], // No store found
    });

    await expect(
      switchStore(db as unknown as DbOrTx, {
        sessionId,
        userId,
        tenantId,
        targetStoreId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects deactivated store with DomainError (STORE_INACTIVE)", async () => {
    const db = createMockDb({
      stores: [mockStores[2]], // inactiveStoreId
    });

    await expect(
      switchStore(db as unknown as DbOrTx, {
        sessionId,
        userId,
        tenantId,
        targetStoreId: inactiveStoreId,
      }),
    ).rejects.toThrow(DomainError);
  });

  it("rejects suspended membership with ForbiddenError (membership.active)", async () => {
    const db = createMockDb({
      stores: [mockStores[0]],
      membership: {
        id: "mem_1",
        tenantId,
        userId,
        roleId: "role_cashier",
        status: "suspended",
        allStores: true,
        storeIds: [],
        lastStoreId: storeAId,
      },
    });

    await expect(
      switchStore(db as unknown as DbOrTx, {
        sessionId,
        userId,
        tenantId,
        targetStoreId: storeAId,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects store when user is restricted and target is not in storeIds", async () => {
    const db = createMockDb({
      stores: [mockStores[1]], // storeB
      membership: {
        id: "mem_2",
        tenantId,
        userId,
        roleId: "role_cashier",
        status: "active",
        allStores: false,
        storeIds: [storeAId], // only storeA permitted
        lastStoreId: storeAId,
      },
      hasSwitchAny: false,
    });

    await expect(
      switchStore(db as unknown as DbOrTx, {
        sessionId,
        userId,
        tenantId,
        targetStoreId: storeBId, // user tries storeB
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("allows restricted user to switch if they possess the store.switch_any permission", async () => {
    const db = createMockDb({
      stores: [mockStores[1]], // storeB
      membership: {
        id: "mem_3",
        tenantId,
        userId,
        roleId: "role_auditor",
        status: "active",
        allStores: false,
        storeIds: [storeAId],
        lastStoreId: storeAId,
      },
      hasSwitchAny: true,
    });

    const res = await switchStore(db as unknown as DbOrTx, {
      sessionId,
      userId,
      tenantId,
      targetStoreId: storeBId,
    });

    expect(res.ok).toBe(true);
    expect(res.storeId).toBe(storeBId);
  });

  describe("listAllowedStores", () => {
    it("returns empty list if membership is missing or suspended", async () => {
      const db = createMockDb({
        membership: null,
      });

      const list = await listAllowedStores(db as unknown as DbOrTx, { tenantId, userId });
      expect(list).toEqual([]);
    });

    it("returns all active stores for allStores members", async () => {
      const activeStores = [mockStores[0], mockStores[1]];
      const db = createMockDb({
        stores: activeStores,
        membership: {
          id: "mem_1",
          tenantId,
          userId,
          roleId: "role_admin",
          status: "active",
          allStores: true,
          storeIds: [],
          lastStoreId: storeAId,
        },
      });

      const list = await listAllowedStores(db as unknown as DbOrTx, { tenantId, userId });
      expect(list.length).toBe(2);
      expect(list.map((s) => s.code)).toEqual(["MAIN", "WH01"]);
    });

    it("filters to assigned storeIds when allStores is false", async () => {
      const activeStores = [mockStores[0], mockStores[1]];
      const db = createMockDb({
        stores: activeStores,
        membership: {
          id: "mem_2",
          tenantId,
          userId,
          roleId: "role_cashier",
          status: "active",
          allStores: false,
          storeIds: [storeAId],
          lastStoreId: storeAId,
        },
        hasSwitchAny: false,
      });

      const list = await listAllowedStores(db as unknown as DbOrTx, { tenantId, userId });
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe(storeAId);
    });
  });
});
