/** Helpers to derive database URLs from DATABASE_URL (whose database name must contain "test" or "ci"). */
export function baseUrl(): URL {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set. Copy .env.test.example to .env.test.");
  return new URL(raw);
}

export const baseDbName = () => baseUrl().pathname.replace("/", "");
export const templateDbName = () => `${baseDbName()}_tpl`;

export function urlFor(dbName: string): string {
  const u = baseUrl();
  u.pathname = `/${dbName}`;
  return u.toString();
}
