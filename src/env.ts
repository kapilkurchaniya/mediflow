import { z } from "zod";

const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.SKIP_ENV_VALIDATION === "true" ||
  process.env.SKIP_ENV_VALIDATION === "1" ||
  process.env.npm_lifecycle_event === "build" ||
  (typeof process.argv !== "undefined" &&
    process.argv.some(
      (arg) => typeof arg === "string" && (arg.includes("next") || arg.includes("build"))
    ));

const envSchema = z
  .object({
    // ─── Core ────────────────────────────────────────────────────────────────
    DATABASE_URL: z
      .string()
      .default(
        isBuildPhase
          ? "postgresql://postgres:postgres@localhost:5432/mediflow_build"
          : ""
      )
      .refine(
        (val) => {
          if (val === "[SENSITIVE]") return true;
          try {
            const u = new URL(val);
            return u.protocol === "postgres:" || u.protocol === "postgresql:";
          } catch {
            return false;
          }
        },
        "DATABASE_URL must be a valid postgres:// URL"
      ),
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

    /**
     * Optional global GSP / IRP API credentials (used as defaults if tenant credentials are unset)
     */
    GSP_BASE_URL: z.string().optional(),
    GSP_CLIENT_ID: z.string().optional(),
    GSP_CLIENT_SECRET: z.string().optional(),
    GSP_PORTAL_USERNAME: z.string().optional(),
    GSP_PORTAL_PASSWORD: z.string().optional(),

    // ─── AI providers (all optional) ─────────────────────────────────────────
    GEMINI_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    COHERE_API_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production" && !isBuildPhase) {
      if (!data.DATABASE_URL || data.DATABASE_URL.includes("mediflow_build")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message:
            "DATABASE_URL is required in production runtime. Please configure DATABASE_URL in your Vercel Project Settings for Production, Preview, and Development.",
        });
      }
      if (!data.APP_ENCRYPTION_KEY) {
        console.warn(
          "⚠️ [env] APP_ENCRYPTION_KEY is unset in production. Using fallback dev key. Please set APP_ENCRYPTION_KEY in Vercel Settings."
        );
      }
      if (!data.CRON_SECRET) {
        console.warn(
          "⚠️ [env] CRON_SECRET is unset in production. Cron endpoints will be unauthorized. Please set CRON_SECRET in Vercel Settings."
        );
      }
    }
  });

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  throw new Error("Invalid environment variables — check the output above");
}

export const env = _env.data;
