/**
 * Drizzle wraps driver errors in a DrizzleQueryError whose message is the SQL text, so the Postgres error
 * (with its SQLSTATE `code` and `constraint`) is on `cause`. Walk the chain instead of matching message text.
 */
type PgErrorLike = { code?: string; constraint?: string; cause?: unknown };

function* chain(err: unknown): Generator<PgErrorLike> {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    yield cur as PgErrorLike;
    cur = (cur as PgErrorLike).cause;
  }
}

/** True when `err` is a unique-constraint violation, optionally on one specific constraint/index name. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  for (const e of chain(err)) {
    if (e.code === "23505" && (!constraint || e.constraint === constraint)) return true;
  }
  return false;
}
