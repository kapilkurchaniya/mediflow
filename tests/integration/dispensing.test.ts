 import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../setup/db";
import { makeWorld, makeMedicine } from "../setup/factories";
import * as schema from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { applyPrescriptionDispensing } from "@/server/domain/compliance";

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t?.cleanup();
});

describe("applyPrescriptionDispensing (B1.4 Compliance hardening)", () => {
  it("partially dispenses a prescription and increments quantityDispensed", async () => {
    const world = await makeWorld(t.db);

    const [rx] = await t.db
      .insert(schema.prescriptions)
      .values({
        tenantId: world.tenant.id,
        storeId: world.store.id,
        patientName: "Patient A",
        doctorName: "Dr. Verma",
        prescriptionDate: "2026-10-01",
        validUntil: "2026-10-31",
        status: "active",
      })
      .returning();

    const [rxItem] = await t.db
      .insert(schema.prescriptionItems)
      .values({
        tenantId: world.tenant.id,
        prescriptionId: rx.id,
        medicineId: world.medicine.id,
        medicineName: world.medicine.name,
        quantityPrescribed: 10,
        quantityDispensed: 0,
      })
      .returning();

    const res = await t.db.transaction((tx) =>
      applyPrescriptionDispensing(tx, {
        prescriptionId: rx.id,
        tenantId: world.tenant.id,
        lines: [{ medicineId: world.medicine.id, quantity: 4 }],
        today: new Date(2026, 9, 15),
      })
    );

    expect(res.status).toBe("partially_dispensed");

    // Verify database state
    const [updatedItem] = await t.db
      .select()
      .from(schema.prescriptionItems)
      .where(eq(schema.prescriptionItems.id, rxItem.id));
    expect(updatedItem?.quantityDispensed).toBe(4);

    const [updatedRx] = await t.db
      .select()
      .from(schema.prescriptions)
      .where(eq(schema.prescriptions.id, rx.id));
    expect(updatedRx?.status).toBe("partially_dispensed");
  });

  it("sets status to fully_dispensed when all prescribed quantity is fulfilled", async () => {
    const world = await makeWorld(t.db);

    const [rx] = await t.db
      .insert(schema.prescriptions)
      .values({
        tenantId: world.tenant.id,
        storeId: world.store.id,
        patientName: "Patient B",
        doctorName: "Dr. Sharma",
        prescriptionDate: "2026-10-01",
        validUntil: "2026-10-31",
        status: "active",
      })
      .returning();

    await t.db.insert(schema.prescriptionItems).values({
      tenantId: world.tenant.id,
      prescriptionId: rx.id,
      medicineId: world.medicine.id,
      medicineName: world.medicine.name,
      quantityPrescribed: 5,
      quantityDispensed: 0,
    });

    const res = await t.db.transaction((tx) =>
      applyPrescriptionDispensing(tx, {
        prescriptionId: rx.id,
        tenantId: world.tenant.id,
        lines: [{ medicineId: world.medicine.id, quantity: 5 }],
        today: new Date(2026, 9, 15),
      })
    );

    expect(res.status).toBe("fully_dispensed");

    const [updatedRx] = await t.db
      .select()
      .from(schema.prescriptions)
      .where(eq(schema.prescriptions.id, rx.id));
    expect(updatedRx?.status).toBe("fully_dispensed");
  });

  it("blocks dispensing more than prescribed for Schedule H1 / Schedule X drugs", async () => {
    const world = await makeWorld(t.db);

    // Create a Schedule H1 medicine
    const h1Medicine = await makeMedicine(t.db, world.tenant.id, {
      name: "Cefixime 200mg",
      schedule: "H1",
    });

    const [rx] = await t.db
      .insert(schema.prescriptions)
      .values({
        tenantId: world.tenant.id,
        storeId: world.store.id,
        patientName: "Patient C",
        doctorName: "Dr. Nair",
        prescriptionDate: "2026-10-01",
        validUntil: "2026-10-31",
        status: "active",
      })
      .returning();

    await t.db.insert(schema.prescriptionItems).values({
      tenantId: world.tenant.id,
      prescriptionId: rx.id,
      medicineId: h1Medicine.id,
      medicineName: h1Medicine.name,
      quantityPrescribed: 6,
      quantityDispensed: 4,
    });

    // Attempting to dispense 3 units (4 + 3 = 7 > 6) must throw
    await expect(
      t.db.transaction((tx) =>
        applyPrescriptionDispensing(tx, {
          prescriptionId: rx.id,
          tenantId: world.tenant.id,
          lines: [{ medicineId: h1Medicine.id, quantity: 3 }],
          today: new Date(2026, 9, 15),
        })
      )
    ).rejects.toThrow(/Excess dispensing prohibited for Schedule H1/);
  });

  it("rejects dispensing when prescription has expired (validUntil < today)", async () => {
    const world = await makeWorld(t.db);

    const [rx] = await t.db
      .insert(schema.prescriptions)
      .values({
        tenantId: world.tenant.id,
        storeId: world.store.id,
        patientName: "Patient D",
        doctorName: "Dr. Kulkarni",
        prescriptionDate: "2026-09-01",
        validUntil: "2026-09-15", // Expired in September
        status: "active",
      })
      .returning();

    await t.db.insert(schema.prescriptionItems).values({
      tenantId: world.tenant.id,
      prescriptionId: rx.id,
      medicineId: world.medicine.id,
      medicineName: world.medicine.name,
      quantityPrescribed: 10,
      quantityDispensed: 0,
    });

    await expect(
      t.db.transaction((tx) =>
        applyPrescriptionDispensing(tx, {
          prescriptionId: rx.id,
          tenantId: world.tenant.id,
          lines: [{ medicineId: world.medicine.id, quantity: 2 }],
          today: new Date(2026, 9, 15), // October 15 (after Sept 15)
        })
      )
    ).rejects.toThrow(/Prescription expired on 2026-09-15/);
  });

  it("rejects dispensing against a cancelled or already fully dispensed prescription", async () => {
    const world = await makeWorld(t.db);

    const [cancelledRx] = await t.db
      .insert(schema.prescriptions)
      .values({
        tenantId: world.tenant.id,
        storeId: world.store.id,
        patientName: "Patient E",
        doctorName: "Dr. Joshi",
        prescriptionDate: "2026-10-01",
        status: "cancelled",
      })
      .returning();

    await expect(
      t.db.transaction((tx) =>
        applyPrescriptionDispensing(tx, {
          prescriptionId: cancelledRx.id,
          tenantId: world.tenant.id,
          lines: [{ medicineName: "Any", quantity: 1 }],
        })
      )
    ).rejects.toThrow(/Cannot dispense against a cancelled prescription/);

    const [fullRx] = await t.db
      .insert(schema.prescriptions)
      .values({
        tenantId: world.tenant.id,
        storeId: world.store.id,
        patientName: "Patient F",
        doctorName: "Dr. Joshi",
        prescriptionDate: "2026-10-01",
        status: "fully_dispensed",
      })
      .returning();

    await expect(
      t.db.transaction((tx) =>
        applyPrescriptionDispensing(tx, {
          prescriptionId: fullRx.id,
          tenantId: world.tenant.id,
          lines: [{ medicineName: "Any", quantity: 1 }],
        })
      )
    ).rejects.toThrow(/Prescription has already been fully dispensed/);
  });
});
