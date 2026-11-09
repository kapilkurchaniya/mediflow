import { NextResponse } from "next/server";
import { db, schema } from "@/server/db";
import { eq, and, lte } from "drizzle-orm";
import { env } from "@/env";
import { enqueue } from "@/server/jobs/outbox";
import { recordWorkerSuccess, recordWorkerFailure } from "@/server/observability/heartbeat";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  // If CRON_SECRET is configured, enforce Bearer authentication
  if (env.CRON_SECRET && token !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    // Find all pending due reminders across active tenants
    const dueReminders = await db
      .select({
        id: schema.reminders.id,
        tenantId: schema.reminders.tenantId,
      })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.status, "pending"),
          lte(schema.reminders.scheduledDate, today)
        )
      )
      .limit(200);

    let enqueuedCount = 0;

    await db.transaction(async (tx) => {
      for (const r of dueReminders) {
        await enqueue(tx, r.tenantId, "reminder.send", { reminderId: r.id });
        enqueuedCount++;
      }
    });

    await recordWorkerSuccess(db, "reminders_cron", { enqueued: enqueuedCount }).catch(() => {});

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      enqueued: enqueuedCount,
    });
  } catch (err: unknown) {
    await recordWorkerFailure(db, "reminders_cron").catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/reminders] Error enqueuing reminders:", message);
    return NextResponse.json(
      { success: false, error: "Reminders cron job failed" },
      { status: 500 }
    );
  }
}

export const POST = GET;
