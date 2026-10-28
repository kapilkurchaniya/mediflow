/** One changed field, as shown on the audit-log page. */
export interface AuditChange {
  field: string;
  from: string;
  to: string;
}

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const norm = (v: unknown) => (v === "" || v === undefined ? null : v);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Turns an audit row's old/new JSON into a list of "field: from → to". For a create (no old value) every
 * new field is listed with "—" as the old value; for a delete every old field is listed.
 */
export function describeChanges(oldValue: unknown, newValue: unknown): AuditChange[] {
  const o = isObject(oldValue) ? oldValue : {};
  const n = isObject(newValue) ? newValue : {};
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])];
  const changes = keys
    .filter((k) => JSON.stringify(norm(o[k])) !== JSON.stringify(norm(n[k])))
    .map((k) => ({ field: k, from: show(o[k]), to: show(n[k]) }));
  if (changes.length === 0 && (oldValue != null || newValue != null) && !isObject(oldValue) && !isObject(newValue)) {
    return [{ field: "value", from: show(oldValue), to: show(newValue) }];
  }
  return changes;
}
