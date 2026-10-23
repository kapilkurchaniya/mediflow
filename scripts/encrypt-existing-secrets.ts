/**
 * scripts/encrypt-existing-secrets.ts
 *
 * One-shot migration: reads every row in whatsapp_configs and sms_configs that
 * has a plaintext secret (i.e. does NOT start with "v1:"), encrypts it with
 * the current APP_ENCRYPTION_KEY, and writes it back.
 *
 * Run once after deploying B0.4:
 *   npx tsx scripts/encrypt-existing-secrets.ts
 *
 * Safe to run multiple times \u2014 already-encrypted rows are skipped.
 *
 * B0.4 \u2014 audit S6
 */
import "dotenv/config"; // loads .env (not .env.local \u2014 run server-side)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/server/db/schema";
import { isNull, ne, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Inline the crypto helpers rather than importing from src/server/crypto.ts
// (which has "server-only" import that blocks tsx in scripts).
// ---------------------------------------------------------------------------
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const PREFIX = "v1:";

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set. Cannot encrypt secrets.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new Error(`APP_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`);
  return key;
}

function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + iv.toString("base64") + ":" + tag.toString("base64") + ":" + encrypted.toString("base64");
}

function isAlreadyEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  console.log("🔐  encrypt-existing-secrets: starting...\n");

  // ── WhatsApp accessToken ─────────────────────────────────────────────────
  const waConfigs = await db.select().from(schema.whatsappConfigs);
  let waUpdated = 0;
  let waSkipped = 0;

  for (const row of waConfigs) {
    if (!row.accessToken) {
      waSkipped++;
      continue;
    }
    if (isAlreadyEncrypted(row.accessToken)) {
      console.log(`  [WA] id=${row.id}  already encrypted — skip`);
      waSkipped++;
      continue;
    }
    const encrypted = encryptSecret(row.accessToken);
    await db
      .update(schema.whatsappConfigs)
      .set({ accessToken: encrypted })
      .where(sql`${schema.whatsappConfigs.id} = ${row.id}`);
    console.log(`  [WA] id=${row.id}  encrypted ✓`);
    waUpdated++;
  }

  // ── SMS apiKey ───────────────────────────────────────────────────────────
  const smsConfigs = await db.select().from(schema.smsConfigs);
  let smsUpdated = 0;
  let smsSkipped = 0;

  for (const row of smsConfigs) {
    if (!row.apiKey) {
      smsSkipped++;
      continue;
    }
    if (isAlreadyEncrypted(row.apiKey)) {
      console.log(`  [SMS] id=${row.id}  already encrypted — skip`);
      smsSkipped++;
      continue;
    }
    const encrypted = encryptSecret(row.apiKey);
    await db
      .update(schema.smsConfigs)
      .set({ apiKey: encrypted })
      .where(sql`${schema.smsConfigs.id} = ${row.id}`);
    console.log(`  [SMS] id=${row.id}  encrypted ✓`);
    smsUpdated++;
  }

  await pool.end();

  console.log(`
\u2705  Done.
   WhatsApp configs: ${waUpdated} encrypted, ${waSkipped} skipped
   SMS configs:      ${smsUpdated} encrypted, ${smsSkipped} skipped
`);
}

main().catch((err) => {
  console.error("❌  encrypt-existing-secrets failed:", err);
  process.exit(1);
});
