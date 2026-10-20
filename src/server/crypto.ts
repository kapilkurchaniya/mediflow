/**
 * src/server/crypto.ts
 *
 * AES-256-GCM symmetric encryption for third-party secrets stored in the DB
 * (WhatsApp accessToken, SMS apiKey, etc.).
 *
 * Key format:  APP_ENCRYPTION_KEY = base64-encoded 32-byte random string.
 *   Generate:  openssl rand -base64 32
 *
 * Stored format: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
 *
 * Backward compat: values that do NOT start with "v1:" are treated as legacy
 * plaintext and returned as-is by decryptSecret so existing rows keep working
 * until scripts/encrypt-existing-secrets.ts re-saves them.
 *
 * B0.4 — audit S6
 */
import "server-only";
import crypto from "node:crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, recommended for GCM
const TAG_BYTES = 16;
const PREFIX = "v1:";

function getKey(): Buffer {
  const raw = env.APP_ENCRYPTION_KEY;
  if (!raw) {
    // In development without a key we still want the app to run. Return a
    // deterministic dev-only key so secrets can be round-tripped. This key is
    // NOT secret — it only protects data in environments where
    // APP_ENCRYPTION_KEY is deliberately unset (i.e. local dev).
    return Buffer.alloc(32, "mediflow-dev-key-not-for-prod!!");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        "Generate one with: openssl rand -base64 32",
    );
  }
  return key;
}

/**
 * Encrypt a plaintext secret.
 * Returns a "v1:<iv>:<tag>:<ciphertext>" string safe to store in the DB.
 */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes
  return (
    PREFIX +
    iv.toString("base64") +
    ":" +
    tag.toString("base64") +
    ":" +
    encrypted.toString("base64")
  );
}

/**
 * Decrypt a stored secret.
 *
 * - If the value starts with "v1:" it is decrypted with AES-256-GCM.
 * - Otherwise it is returned as-is (legacy plaintext — re-save to encrypt).
 * - Returns null/undefined as-is.
 */
export function decryptSecret(stored: string | null | undefined): string | null | undefined {
  if (!stored) return stored;
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext — still works, will be re-encrypted on next save.
    return stored;
  }

  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("decryptSecret: malformed stored value — expected v1:<iv>:<tag>:<cipher>");
  }
  const [ivB64, tagB64, cipherB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(
      "decryptSecret: authentication failed — ciphertext was tampered or wrong key",
    );
  }
}

/**
 * Returns a masked display value for use in the UI:  "••••a1b2"
 * Shows the last 4 characters so the user can verify which key is stored
 * without ever seeing the full secret.
 *
 * Returns an empty string for falsy input.
 */
export function maskSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  // Decrypt first so the mask is applied to the real value, not the ciphertext
  const plain = decryptSecret(stored) ?? "";
  if (plain.length <= 4) return "••••";
  return "••••" + plain.slice(-4);
}

/**
 * Returns true if the value looks like a masked placeholder
 * ("••••XXXX") from the UI, meaning the user did not change it.
 */
export function isMasked(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("••••");
}
