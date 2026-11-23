import type { schema } from "@/server/db";

export interface PreloadedMembershipRow {
  membership: typeof schema.memberships.$inferSelect;
  permission: string | null;
}

const preloadedMembershipMap = new WeakMap<object, PreloadedMembershipRow[]>();

export function setPreloadedMembershipRows(session: object, rows: PreloadedMembershipRow[]): void {
  preloadedMembershipMap.set(session, rows);
}

export function getPreloadedMembershipRows(session: object): PreloadedMembershipRow[] | undefined {
  return preloadedMembershipMap.get(session);
}
