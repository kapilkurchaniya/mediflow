import "server-only";
import { pool } from "@/server/db";

export interface PoolMetrics {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export function getPoolMetrics(): PoolMetrics {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export async function measureConnectionAcquisition(): Promise<{ durationMs: number; error?: string }> {
  const start = performance.now();
  try {
    const client = await pool.connect();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    client.release();
    return { durationMs };
  } catch (err: unknown) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return { durationMs, error: err instanceof Error ? err.message : String(err) };
  }
}
