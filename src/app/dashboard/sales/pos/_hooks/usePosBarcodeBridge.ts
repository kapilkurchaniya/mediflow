"use client";

import { useCallback } from "react";
import { useHardwareBridge } from "@/desktop/useHardwareBridge";
import type { PosDataSource, SearchResultBatch, SearchResultMedicine } from "../_data/posData";

interface UsePosBarcodeBridgeProps {
  dataSource: PosDataSource;
  onSelectBatch: (
    medicine: SearchResultMedicine,
    batch: SearchResultBatch,
    allBatches: SearchResultBatch[],
  ) => void;
  playSound: (type: "beep" | "chime") => void;
  onBarcodeMiss?: (barcode: string) => void;
}

/**
 * Global Hardware USB Barcode Scanner Hook for Retail POS Terminal.
 * Intercepts high-speed USB HID scans even when search input is unfocused,
 * auto-adding matching in-stock items or populating the search bar on miss.
 */
export function usePosBarcodeBridge({
  dataSource,
  onSelectBatch,
  playSound,
  onBarcodeMiss,
}: UsePosBarcodeBridgeProps) {
  const handleBarcodeScanned = useCallback(
    async (event: { barcode: string }) => {
      const rawBarcode = event.barcode.trim();
      if (!rawBarcode) return;

      try {
        const items = await dataSource.searchItems(rawBarcode);
        if (items.length > 0 && items[0].batches.length > 0) {
          const firstInStock =
            items[0].batches.find((b) => b.qtyOnHand > 0) || items[0].batches[0];
          onSelectBatch(items[0].medicine, firstInStock, items[0].batches);
          playSound("beep");
        } else {
          onBarcodeMiss?.(rawBarcode);
        }
      } catch (err) {
        console.error("[usePosBarcodeBridge] Barcode search error:", err);
      }
    },
    [dataSource, onSelectBatch, playSound, onBarcodeMiss],
  );

  return useHardwareBridge(handleBarcodeScanned);
}
