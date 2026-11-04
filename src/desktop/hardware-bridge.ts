import type {
  HardwareBridge,
  PrinterDevice,
  BarcodeScanEvent,
  DrawerKickOptions,
} from "./types";

/**
 * Checks whether the current runtime environment is a native Tauri desktop container.
 */
export function isTauriDesktop(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

interface TauriInternals {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

function getTauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  if (typeof window === "undefined") return null;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  return internals?.invoke ?? null;
}

export class DefaultHardwareBridge implements HardwareBridge {
  private scannerListeners: Set<(event: BarcodeScanEvent) => void> = new Set();
  private buffer = "";
  private keyTimes: number[] = [];
  private isListening = false;
  private keydownHandler?: (e: KeyboardEvent) => void;

  constructor() {
    this.setupScannerListener();
  }

  isDesktop(): boolean {
    return isTauriDesktop();
  }

  async listPrinters(): Promise<PrinterDevice[]> {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        return (await invoke("list_printers")) as PrinterDevice[];
      } catch (err) {
        console.warn("[HardwareBridge] Failed to invoke list_printers native command:", err);
      }
    }

    // Web / Fallback simulated printers
    return [
      { id: "default", name: "System Default Printer", isDefault: true, kind: "generic" },
      { id: "pos-thermal", name: "POS-80 Thermal Printer", isDefault: false, kind: "thermal", port: "USB001" },
      { id: "pos-dotmatrix", name: "Epson LX-300+II Dot Matrix", isDefault: false, kind: "dotmatrix", port: "LPT1" },
    ];
  }

  async printRaw(printerName: string, data: Uint8Array): Promise<boolean> {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        await invoke("print_raw", {
          printerName,
          data: Array.from(data),
        });
        return true;
      } catch (err) {
        console.error("[HardwareBridge] Native print_raw failed:", err);
        return false;
      }
    }

    // Web fallback: simulate silent print success for testing / browser mode
    return true;
  }

  async openCashDrawer(options?: DrawerKickOptions): Promise<boolean> {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        await invoke("kick_cash_drawer", {
          printerName: options?.printerName,
          pin: options?.pin ?? 0,
          onTimeMs: options?.onTimeMs ?? 50,
          offTimeMs: options?.offTimeMs ?? 500,
        });
        return true;
      } catch (err) {
        console.error("[HardwareBridge] Native kick_cash_drawer failed:", err);
        return false;
      }
    }

    // Web fallback
    return true;
  }

  onBarcodeScanned(callback: (event: BarcodeScanEvent) => void): () => void {
    this.scannerListeners.add(callback);
    return () => {
      this.scannerListeners.delete(callback);
    };
  }

  /**
   * Simulates a hardware barcode reader scan event (used in unit/integration tests).
   */
  simulateScan(barcode: string, scanDurationMs = 25): void {
    const event: BarcodeScanEvent = {
      barcode,
      timestamp: Date.now(),
      scanDurationMs,
    };
    for (const listener of this.scannerListeners) {
      listener(event);
    }
  }

  private setupScannerListener(): void {
    if (typeof window === "undefined" || this.isListening) return;

    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e, performance.now());
    };

    window.addEventListener("keydown", this.keydownHandler, true);
    this.isListening = true;
  }

  handleKeydown(
    e: {
      key: string;
      ctrlKey?: boolean;
      altKey?: boolean;
      metaKey?: boolean;
      preventDefault?: () => void;
      stopPropagation?: () => void;
    },
    now = performance.now(),
  ): void {
    // Ignore modifier combinations (Ctrl, Alt, Meta)
    if (e.ctrlKey || e.altKey || e.metaKey) {
      this.resetBuffer();
      return;
    }

    if (e.key === "Enter") {
      if (this.buffer.length >= 3 && this.keyTimes.length >= 3) {
        const totalDuration = this.keyTimes[this.keyTimes.length - 1] - this.keyTimes[0];
        const avgInterval = totalDuration / (this.keyTimes.length - 1);

        // Barcode scanners deliver characters in rapid succession (< 35ms avg)
        if (avgInterval < 35) {
          e.preventDefault?.();
          e.stopPropagation?.();
          this.simulateScan(this.buffer, Math.round(totalDuration));
        }
      }
      this.resetBuffer();
      return;
    }

    // Check inter-character timing threshold
    if (this.keyTimes.length > 0) {
      const lastTime = this.keyTimes[this.keyTimes.length - 1];
      const diff = now - lastTime;
      // If typing is human speed (> 60ms between keys), reset buffer
      if (diff > 60) {
        this.resetBuffer();
      }
    }

    if (e.key.length === 1) {
      this.buffer += e.key;
      this.keyTimes.push(now);
    }
  }

  destroy(): void {
    if (typeof window !== "undefined" && this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler, true);
      this.isListening = false;
    }
  }

  private resetBuffer(): void {
    this.buffer = "";
    this.keyTimes = [];
  }
}

let bridgeInstance: DefaultHardwareBridge | null = null;

export function getHardwareBridge(): DefaultHardwareBridge {
  if (!bridgeInstance) {
    bridgeInstance = new DefaultHardwareBridge();
  }
  return bridgeInstance;
}
