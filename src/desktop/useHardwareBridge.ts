"use client";

import { useEffect, useState, useCallback } from "react";
import { getHardwareBridge, isTauriDesktop } from "./hardware-bridge";
import type { PrinterDevice, PrintFormat, BarcodeScanEvent, DrawerKickOptions } from "./types";

export interface UseHardwareBridgeResult {
  isDesktop: boolean;
  printers: PrinterDevice[];
  selectedPrinter: string;
  setSelectedPrinter: (id: string) => void;
  printFormat: PrintFormat;
  setPrintFormat: (fmt: PrintFormat) => void;
  refreshPrinters: () => Promise<void>;
  openCashDrawer: (opts?: DrawerKickOptions) => Promise<boolean>;
}

export function useHardwareBridge(
  onBarcodeScanned?: (event: BarcodeScanEvent) => void,
): UseHardwareBridgeResult {
  const [isDesktop] = useState<boolean>(() => isTauriDesktop());
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [printFormat, setPrintFormat] = useState<PrintFormat>("thermal-80mm");

  const refreshPrinters = useCallback(async () => {
    const bridge = getHardwareBridge();
    const list = await bridge.listPrinters();
    setPrinters(list);

    if (list.length > 0) {
      const def = list.find((p) => p.isDefault) ?? list[0];
      setSelectedPrinter((prev) => prev || def.name);
      if (def.kind === "dotmatrix") {
        setPrintFormat("dotmatrix-80col");
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getHardwareBridge()
      .listPrinters()
      .then((list) => {
        if (cancelled) return;
        setPrinters(list);
        if (list.length > 0) {
          const def = list.find((p) => p.isDefault) ?? list[0];
          setSelectedPrinter((prev) => prev || def.name);
          if (def.kind === "dotmatrix") {
            setPrintFormat("dotmatrix-80col");
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to global hardware barcode scanner
  useEffect(() => {
    if (!onBarcodeScanned) return;
    const bridge = getHardwareBridge();
    const unsub = bridge.onBarcodeScanned(onBarcodeScanned);
    return () => {
      unsub();
    };
  }, [onBarcodeScanned]);

  const openCashDrawer = useCallback(
    async (opts?: DrawerKickOptions) => {
      const bridge = getHardwareBridge();
      return await bridge.openCashDrawer({
        printerName: opts?.printerName || selectedPrinter,
        ...opts,
      });
    },
    [selectedPrinter],
  );

  return {
    isDesktop,
    printers,
    selectedPrinter,
    setSelectedPrinter,
    printFormat,
    setPrintFormat,
    refreshPrinters,
    openCashDrawer,
  };
}
