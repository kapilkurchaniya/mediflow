"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getPosDB, type PosDB } from "./db";
import { OfflinePosDataSource } from "./offline-datasource";
import { defaultPosDataSource, type PosDataSource } from "@/app/dashboard/sales/pos/_data/posData";
import { startSyncCoordinator, runSyncCycle } from "./sync";
import { useLiveQuery } from "./useLiveQuery";

export interface PosDataSourceState {
  isOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  dataSource: PosDataSource;
  triggerSyncNow: () => Promise<void>;
}

export interface UsePosDataSourceOptions {
  tenantId?: string;
  storeId?: string;
  deviceId?: string;
  cashierId?: string;
}

export function usePosDataSource(options: UsePosDataSourceOptions): PosDataSourceState {
  const [db] = useState<PosDB | null>(() =>
    typeof window !== "undefined" ? getPosDB() : null,
  );
  const [isBrowserOffline, setIsBrowserOffline] = useState(() =>
    typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? !navigator.onLine
      : false,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // Listen to connectivity events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setIsBrowserOffline(false);
    const handleOffline = () => setIsBrowserOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Observe pending outbox sales reactively for the active store
  const pendingCount = useLiveQuery(
    async () => {
      if (!db || !options.storeId) return 0;
      return await db.pendingSales
        .where("[storeId+status]")
        .anyOf([
          [options.storeId, "pending"],
          [options.storeId, "syncing"],
        ])
        .count();
    },
    [db, options.storeId],
    0,
  );

  // Fetch lastSyncAt from Dexie meta
  useEffect(() => {
    if (!db) return;
    void db.getMeta<string>("lastSyncAt").then((val) => {
      if (val) setLastSyncAt(val);
    });
  }, [db, isSyncing]);

  // Periodic and event-driven background sync coordinator
  useEffect(() => {
    if (!db || isBrowserOffline) return;

    const coordinator = startSyncCoordinator(db, 60_000);
    return () => {
      coordinator.stop();
    };
  }, [db, isBrowserOffline]);

  // Manual sync trigger
  const triggerSyncNow = useCallback(async () => {
    if (!db || isBrowserOffline || isSyncing) return;
    setIsSyncing(true);
    try {
      await runSyncCycle(db);
      const updatedSyncAt = await db.getMeta<string>("lastSyncAt");
      if (updatedSyncAt) setLastSyncAt(updatedSyncAt);
    } catch (e) {
      console.error("[usePosDataSource] Manual sync error:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [db, isBrowserOffline, isSyncing]);

  // Construct offline data source if offline or fallback needed
  const offlineDs = useMemo(() => {
    if (!db) return null;
    return new OfflinePosDataSource(db, {
      tenantId: options.tenantId || "default-tenant",
      storeId: options.storeId || "default-store",
      deviceId: options.deviceId || "dev01",
      cashierId: options.cashierId || "cashier-default",
    });
  }, [db, options.tenantId, options.storeId, options.deviceId, options.cashierId]);

  // Active data source: online server actions or offline Dexie
  const activeDataSource = useMemo<PosDataSource>(() => {
    if (isBrowserOffline && offlineDs) {
      return offlineDs;
    }
    return defaultPosDataSource;
  }, [isBrowserOffline, offlineDs]);

  return {
    isOffline: isBrowserOffline,
    isSyncing,
    pendingCount,
    lastSyncAt,
    dataSource: activeDataSource,
    triggerSyncNow,
  };
}
