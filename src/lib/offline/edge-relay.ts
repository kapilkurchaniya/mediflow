/**
 * Store Edge Relay (N1): LAN multi-terminal sync envelope & sequence reconciliation.
 */
export interface EdgeRelayEnvelope<T = unknown> {
  storeId: string;
  terminalId: string;
  seq: number;
  entityType: "sale" | "stock_movement" | "payment";
  entityId: string;
  createdAtIso: string;
  payload: T;
}

export function mergeEdgeRelayEnvelopes<T>(
  local: EdgeRelayEnvelope<T>[],
  remote: EdgeRelayEnvelope<T>[],
): {
  merged: EdgeRelayEnvelope<T>[];
  newlyAppliedCount: number;
  highWaterSeqByTerminal: Record<string, number>;
} {
  const seen = new Map<string, EdgeRelayEnvelope<T>>();
  for (const env of local) {
    seen.set(`${env.terminalId}:${env.seq}:${env.entityId}`, env);
  }

  let newlyAppliedCount = 0;
  for (const env of remote) {
    const key = `${env.terminalId}:${env.seq}:${env.entityId}`;
    if (!seen.has(key)) {
      seen.set(key, env);
      newlyAppliedCount++;
    }
  }

  const merged = Array.from(seen.values()).sort((a, b) =>
    a.createdAtIso.localeCompare(b.createdAtIso),
  );

  const highWaterSeqByTerminal: Record<string, number> = {};
  for (const env of merged) {
    highWaterSeqByTerminal[env.terminalId] = Math.max(
      highWaterSeqByTerminal[env.terminalId] ?? 0,
      env.seq,
    );
  }

  return { merged, newlyAppliedCount, highWaterSeqByTerminal };
}
