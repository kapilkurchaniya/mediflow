import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DefaultHardwareBridge, isTauriDesktop } from "@/desktop/hardware-bridge";

describe("Hardware Bridge & Barcode Intercept", () => {
  let bridge: DefaultHardwareBridge;

  beforeEach(() => {
    bridge = new DefaultHardwareBridge();
  });

  afterEach(() => {
    bridge.destroy();
  });

  it("detects web runtime when Tauri internals are not present", () => {
    expect(isTauriDesktop()).toBe(false);
    expect(bridge.isDesktop()).toBe(false);
  });

  it("lists available fallback printers in browser mode", async () => {
    const list = await bridge.listPrinters();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((p) => p.kind === "thermal")).toBe(true);
    expect(list.some((p) => p.kind === "dotmatrix")).toBe(true);
  });

  it("emits barcode scan event when simulateScan is triggered", () => {
    const fn = vi.fn();
    const unsub = bridge.onBarcodeScanned(fn);

    bridge.simulateScan("8901234567890", 22);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({
        barcode: "8901234567890",
        scanDurationMs: 22,
      }),
    );

    unsub();
    bridge.simulateScan("9999999999999");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("intercepts rapid scanner keyboard events with Enter termination", () => {
    const fn = vi.fn();
    bridge.onBarcodeScanned(fn);

    // Simulate rapid barcode scanner typing (< 20ms per character)
    const barcode = "MED890123";
    let now = 1000;

    for (const char of barcode) {
      bridge.handleKeydown({ key: char }, now);
      now += 15; // 15ms per char
    }

    // Terminating Enter
    const preventDefault = vi.fn();
    bridge.handleKeydown({ key: "Enter", preventDefault }, now);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({
        barcode: "MED890123",
      }),
    );
    expect(preventDefault).toHaveBeenCalled();
  });

  it("discards slow manual human typing (> 60ms) and does not fire barcode event", () => {
    const fn = vi.fn();
    bridge.onBarcodeScanned(fn);

    const manualText = "ABC";
    let now = 1000;

    for (const char of manualText) {
      bridge.handleKeydown({ key: char }, now);
      now += 150; // Human typing speed: 150ms per key
    }

    // Terminating Enter
    const preventDefault = vi.fn();
    bridge.handleKeydown({ key: "Enter", preventDefault }, now);

    expect(fn).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("fires cash drawer pulse cleanly", async () => {
    const success = await bridge.openCashDrawer({ pin: 0 });
    expect(success).toBe(true);
  });
});
