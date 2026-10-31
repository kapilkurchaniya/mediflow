/**
 * Strict safety guard for E2E database resets.
 * Enforces:
 * 1. Explicit environment variable: ALLOW_E2E_DB_RESET="1"
 * 2. Dedicated test database: exactly "mediflow_test"
 * 3. Localhost only: ["localhost", "127.0.0.1", "::1", "[::1]"]
 */

export const ALLOWED_TEST_DATABASE = "mediflow_test";
export const ALLOWED_LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

export function validateE2EDatabaseUrl(
  url?: string,
  allowResetEnv: string | undefined = process.env.ALLOW_E2E_DB_RESET
): { host: string; dbName: string } {
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SAFETY VIOLATION: Invalid database URL format: "${url}"`);
  }

  const host = parsed.hostname;
  const dbName = parsed.pathname.replace(/^\//, "");

  if (allowResetEnv !== "1") {
    throw new Error(
      'SAFETY VIOLATION: Refusing database reset without explicit ALLOW_E2E_DB_RESET="1" permission flag.'
    );
  }

  if (!ALLOWED_LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `SAFETY VIOLATION: Refusing to reset non-local database (host: "${host}"). E2E tests only run against local instances.`
    );
  }

  if (dbName !== ALLOWED_TEST_DATABASE) {
    throw new Error(
      `SAFETY VIOLATION: Refusing to reset database "${dbName}". E2E seed strictly requires the database name to be "${ALLOWED_TEST_DATABASE}".`
    );
  }

  return { host, dbName };
}
