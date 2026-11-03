import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";
import { registerDevice } from "@/server/domain/devices";
import { authenticateDevice } from "@/server/domain/devices/auth";
import {
  formatDeviceInvoiceNo,
  getFiscalYear,
  reserveDeviceInvoiceNumbers,
  validateDeviceInvoiceNumber,
} from "@/server/domain/sync/numbers";
import type { AuthCtx } from "@/server/rbac";

vi.mock("@/server/auth", () => ({
  requireAuth: async () => {
    throw new Error("not used");
  },
  getCurrentSession: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.cleanup();
});

describe("Task A4.3: Device Sequence Reservations & Invoice Formatting", () => {
  async function setupDevice(code: string = "01") {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id, { code: "AP" });
    const user = await makeUser(t.db);

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: store.id,
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
      permissions: new Set(["settings.manage"]),
      allowedStoreIds: "all",
    };

    const reg = await registerDevice(t.db, ctx, {
      code,
      name: `Counter ${code}`,
      platform: "desktop",
      storeId: store.id,
    });

    const deviceCtx = await authenticateDevice(t.db, `Bearer ${reg.rawToken}`);
    return { tenant, store, user, deviceCtx };
  }

  it("atomically allocates sequential blocks without gaps", async () => {
    const { deviceCtx } = await setupDevice("01");

    const block1 = await reserveDeviceInvoiceNumbers(t.db, deviceCtx, {
      clientReservationId: "res-client-001",
      count: 50,
    });

    expect(block1.startSeq).toBe(1);
    expect(block1.endSeq).toBe(50);
    expect(block1.count).toBe(50);
    expect(block1.deviceCode).toBe("01");

    const block2 = await reserveDeviceInvoiceNumbers(t.db, deviceCtx, {
      clientReservationId: "res-client-002",
      count: 25,
    });

    expect(block2.startSeq).toBe(51);
    expect(block2.endSeq).toBe(75);
    expect(block2.count).toBe(25);
  });

  it("strictly enforces canonical invoice format <= 16 chars under GST Rule 46(b)", async () => {
    const fiscalYear = "2025-2026";
    const formatted = formatDeviceInvoiceNo({
      storeCode: "AP",
      deviceCode: "01",
      fiscalYear,
      sequence: 1,
    });

    // Structure: AP01-2526-000001 (4 + 1 + 4 + 1 + 6 = 16)
    expect(formatted).toBe("AP01-2526-000001");
    expect(formatted.length).toBeLessThanOrEqual(16);

    const maxSequence = formatDeviceInvoiceNo({
      storeCode: "MH",
      deviceCode: "Z9",
      fiscalYear,
      sequence: 999999,
    });
    expect(maxSequence).toBe("MHZ9-2526-999999");
    expect(maxSequence.length).toBeLessThanOrEqual(16);

    // Overlong prefix rejection
    expect(() =>
      formatDeviceInvoiceNo({
        storeCode: "STORE-OVERLONG",
        deviceCode: "01-OVERLONG",
        fiscalYear: "2025-2026",
        sequence: 10000000,
      }),
    ).toThrow();
  });

  it("is idempotent: re-submitting same clientReservationId returns original range", async () => {
    const { deviceCtx } = await setupDevice("02");

    const res1 = await reserveDeviceInvoiceNumbers(t.db, deviceCtx, {
      clientReservationId: "fixed-client-uuid",
      count: 100,
    });

    const res2 = await reserveDeviceInvoiceNumbers(t.db, deviceCtx, {
      clientReservationId: "fixed-client-uuid",
      count: 100,
    });

    expect(res2.reservationId).toBe(res1.reservationId);
    expect(res2.startSeq).toBe(res1.startSeq);
    expect(res2.endSeq).toBe(res1.endSeq);
  });

  it("validates offline invoice sequences against allocated reservations", async () => {
    const { tenant, store, deviceCtx } = await setupDevice("03");
    const fy = getFiscalYear();

    const reservation = await reserveDeviceInvoiceNumbers(t.db, deviceCtx, {
      clientReservationId: "res-val-001",
      count: 20,
    });

    // Valid sequence within [startSeq, endSeq]
    await expect(
      validateDeviceInvoiceNumber(t.db, {
        tenantId: tenant.id,
        storeId: store.id,
        deviceId: deviceCtx.deviceId,
        fiscalYear: fy,
        sequenceNumber: reservation.startSeq + 5,
        reservationId: reservation.reservationId,
      }),
    ).resolves.toBeUndefined();

    // Sequence outside range (above endSeq)
    await expect(
      validateDeviceInvoiceNumber(t.db, {
        tenantId: tenant.id,
        storeId: store.id,
        deviceId: deviceCtx.deviceId,
        fiscalYear: fy,
        sequenceNumber: reservation.endSeq + 1,
      }),
    ).rejects.toThrow("not part of a valid reservation");

    // Sequence for different financial year
    await expect(
      validateDeviceInvoiceNumber(t.db, {
        tenantId: tenant.id,
        storeId: store.id,
        deviceId: deviceCtx.deviceId,
        fiscalYear: "2019-2020",
        sequenceNumber: reservation.startSeq,
      }),
    ).rejects.toThrow("not part of a valid reservation");
  });

  it("isolates reservation sequences across distinct devices concurrently", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id, { code: "ST" });
    const user = await makeUser(t.db);

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: store.id,
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
      permissions: new Set(["settings.manage"]),
      allowedStoreIds: "all",
    };

    const regA = await registerDevice(t.db, ctx, { code: "A1", name: "Dev A1", storeId: store.id });
    const regB = await registerDevice(t.db, ctx, { code: "B1", name: "Dev B1", storeId: store.id });

    const devA = await authenticateDevice(t.db, `Bearer ${regA.rawToken}`);
    const devB = await authenticateDevice(t.db, `Bearer ${regB.rawToken}`);

    const [resA, resB] = await Promise.all([
      reserveDeviceInvoiceNumbers(t.db, devA, { clientReservationId: "conc-a", count: 10 }),
      reserveDeviceInvoiceNumbers(t.db, devB, { clientReservationId: "conc-b", count: 10 }),
    ]);

    expect(resA.deviceCode).toBe("A1");
    expect(resB.deviceCode).toBe("B1");
    expect(resA.startSeq).toBe(1);
    expect(resB.startSeq).toBe(1);
  });
});
