import crypto from "node:crypto";

export interface ReceiptTokenPayload {
  saleId: string;
  tenantId: string;
  exp: number; // Unix timestamp in seconds
}

export type TokenVerificationResult =
  | { valid: true; saleId: string; tenantId: string; exp: number }
  | { valid: false; error: string };

function getSigningSecret(): string {
  return (
    process.env.RECEIPT_SIGNING_SECRET ||
    process.env.JWT_SECRET ||
    "mediflow_public_receipt_token_signing_secret_key"
  );
}

function base64UrlEncode(strOrBuffer: string | Buffer): string {
  const buf = typeof strOrBuffer === "string" ? Buffer.from(strOrBuffer, "utf-8") : strOrBuffer;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Generates an unguessable, cryptographically signed, tamper-proof receipt token (HMAC-SHA256)
 * @param opts.saleId - UUID of the sale
 * @param opts.tenantId - UUID of the pharmacy tenant
 * @param opts.expiresInDays - Token validity in days (default 90 days)
 */
export function generateReceiptToken(opts: {
  saleId: string;
  tenantId: string;
  expiresInDays?: number;
}): string {
  const expiresInDays = opts.expiresInDays ?? 90;
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 86400;

  const payload: ReceiptTokenPayload = {
    saleId: opts.saleId,
    tenantId: opts.tenantId,
    exp,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest();
  const signatureB64 = base64UrlEncode(signature);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Validates the HMAC signature and expiration timestamp of a public receipt token using constant-time comparison
 */
export function verifyReceiptToken(token: string): TokenVerificationResult {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Empty or invalid token format" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Malformed receipt token" };
  }

  const [payloadB64, providedSigB64] = parts;

  // Compute expected signature
  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest();
  const expectedSigB64 = base64UrlEncode(expectedSig);

  // Constant-time signature verification to prevent timing attacks
  const providedSigBuf = Buffer.from(providedSigB64);
  const expectedSigBuf = Buffer.from(expectedSigB64);

  if (
    providedSigBuf.length !== expectedSigBuf.length ||
    !crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)
  ) {
    return { valid: false, error: "Invalid token signature" };
  }

  // Parse and validate payload
  let payload: ReceiptTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return { valid: false, error: "Corrupted token payload" };
  }

  if (!payload.saleId || !payload.tenantId || !payload.exp) {
    return { valid: false, error: "Missing required payload fields" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSec) {
    return { valid: false, error: "Receipt link has expired" };
  }

  return {
    valid: true,
    saleId: payload.saleId,
    tenantId: payload.tenantId,
    exp: payload.exp,
  };
}

