import { z } from "zod";

const envSchema = z
  .object({
    // ─── Core ────────────────────────────────────────────────────────────────
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid postgres:// URL"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // ─── Security (required in production) ───────────────────────────────────
    /**
     * 32-byte random key encoded as base64 (openssl rand -base64 32).
     * Used by src/server/crypto.ts to encrypt third-party secrets at rest.
     */
    APP_ENCRYPTION_KEY: z.string().optional(),

    /**
     * Shared secret for /api/cron/* routes. Set to a long random string.
     */
    CRON_SECRET: z.string().optional(),

    // ─── WhatsApp ─────────────────────────────────────────────────────────────
    /**
     * Token used during Meta webhook verification handshake.
     */
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),

    /**
     * App Secret from Meta Developer Console — used to verify HMAC-SHA256
     * signatures on incoming webhooks (X-Hub-Signature-256).
     */
    WHATSAPP_APP_SECRET: z.string().optional(),

    // ─── E-Invoice / GST ─────────────────────────────────────────────────────
    /**
     * Controls e-invoice behaviour:
     *  - "disabled"    (default) — all e-invoice actions throw a clear error
     *  - "simulator"   — generates IRNs locally (for development/testing)
     *  - "sandbox"     — calls a real GSP sandbox endpoint
     *  - "production"  — calls the live IRP via a GSP
     */
    EINVOICE_MODE: z
      .enum(["disabled", "simulator", "sandbox", "production"])
      .default("disabled"),

    // ─── AI providers (all optional) ─────────────────────────────────────────
    GEMINI_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    COHERE_API_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isBuildPhase =
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.SKIP_ENV_VALIDATION === "true" ||
      process.env.SKIP_ENV_VALIDATION === "1";

    if (data.NODE_ENV === "production" && !isBuildPhase) {
      if (!data.APP_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APP_ENCRYPTION_KEY"],
          message: "APP_ENCRYPTION_KEY is required in production",
        });
      }
      if (!data.CRON_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CRON_SECRET"],
          message: "CRON_SECRET is required in production",
        });
      }
    }
  });

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  throw new Error("Invalid environment variables — check the output above");
}

export const env = _env.data;

