import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { recordStockMovement } from "@/server/domain/stock";
import { createTestDb } from "../setup/db";
import { makeBatch, makeWorld } from "../setup/factories";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

async function setup(qty: number) {
  const w = await makeWorld(t.db);
  const batch = await makeBatch(t.db, { tenantId: w.tenant.id, storeId: w.store.id, medicineId: w.medicine.id, qtyOnHand: qty });
  const move = (qtyChange: number, type: "sale" | "purchase" | "adjustment" = "sale") =>
    t.db.transaction((tx) =>
      recordStockMovement({
        tx,
        tenantId: w.tenant.id,
        storeId: w.store.id,
        batchId: batch.id,
        medicineId: w.medicine.id,
        type,
        qtyChange,
        userId: w.user.id,
      }),
    );
  const onHand = async () => (await t.db.select().from(schema.batches).where(eq(schema.batches.id, batch.id)))[0].qtyOnHand;
  return { w, batch, move, onHand };
}

describe("recordStockMovement", () => {
  it("writes a ledger row with the balance after the change and updates the batch", async () => {
    const { batch, move, onHand } = await setup(10);
    expect(await move(-3)).toBe(7);
    expect(await onHand()).toBe(7);

    const rows = await t.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.batchId, batch.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "sale", qtyChange: -3, balanceAfter: 7 });
  });

  it("rejects a change that would make the balance negative and leaves everything untouched", async () => {
    const { batch, move, onHand } = await setup(5);
    await expect(move(-6)).rejects.toThrow(/Insufficient stock/);
    expect(await onHand()).toBe(5);
    const rows = await t.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.batchId, batch.id));
    expect(rows).toHaveLength(0);
  });

  it("rejects a zero change", async () => {
    const { move } = await setup(5);
    await expect(move(0)).rejects.toThrow(/cannot be zero/);
  });

  it("rejects an unknown batch", async () => {
    const w = await makeWorld(t.db);
    await expect(
      t.db.transaction((tx) =>
        recordStockMovement({
          tx,
          tenantId: w.tenant.id,
          storeId: w.store.id,
          batchId: "00000000-0000-0000-0000-000000000000",
          medicineId: w.medicine.id,
          type: "sale",
          qtyChange: -1,
          userId: w.user.id,
        }),
      ),
    ).rejects.toThrow(/not found/);
  });

  it("CONCURRENCY: two cashiers each selling 6 of 10 units -> exactly one succeeds", async () => {
    const { move, onHand } = await setup(10);
    const results = await Promise.allSettled([move(-6), move(-6)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await onHand()).toBe(4);
  });

  it("CONCURRENCY: 20 parallel single-unit sales of a 12-unit batch sell exactly 12", async () => {
    const { move, onHand } = await setup(12);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => move(-1)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(12);
    expect(await onHand()).toBe(0);
  });

  it("LEDGER REPLAY: the movements always add up to the batch balance", async () => {
    const { batch, move, onHand } = await setup(0);
    await move(100, "purchase");
    await move(-30);
    await move(-5);
    await move(12, "adjustment");
    await Promise.allSettled([move(-40), move(-40), move(-40)]); // only some can succeed

    const rows = await t.db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.batchId, batch.id))
      .orderBy(asc(schema.stockMovements.id));

    let running = 0;
    for (const r of rows) {
      running += r.qtyChange;
      expect(r.balanceAfter).toBe(running); // each row's balance is the running total
    }
    expect(running).toBe(await onHand());
    expect(running).toBeGreaterThanOrEqual(0);
  });
});
