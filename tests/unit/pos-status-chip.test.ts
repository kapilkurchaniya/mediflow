import { describe, it, expect } from "vitest";

describe("PosStatusChip Formatting and State Evaluation", () => {
  function formatRelativeSync(lastSyncAt: string | null): string {
    if (!lastSyncAt) return "just now";
    const diffMs = Date.now() - new Date(lastSyncAt).getTime();
    if (isNaN(diffMs) || diffMs < 0) return "just now";
    const mins = Math.floor(diffMs / 60000);
    if (mins === 0) return "just now";
    if (mins === 1) return "1 min ago";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  function getChipDescriptor(params: {
    isOffline: boolean;
    isSyncing: boolean;
    pendingCount: number;
    lastSyncAt: string | null;
  }) {
    if (params.isSyncing) {
      return {
        mode: "syncing",
        text: "Syncing...",
        hasBadge: params.pendingCount > 0,
        badgeText: params.pendingCount > 0 ? String(params.pendingCount) : null,
      };
    }
    if (params.isOffline) {
      return {
        mode: "offline",
        text: `Offline ${params.pendingCount > 0 ? `· ${params.pendingCount} pending` : ""}`.trim(),
        hasBadge: params.pendingCount > 0,
        badgeText: params.pendingCount > 0 ? String(params.pendingCount) : null,
      };
    }
    return {
      mode: "online",
      text: `Online · synced ${formatRelativeSync(params.lastSyncAt)}`,
      hasBadge: params.pendingCount > 0,
      badgeText: params.pendingCount > 0 ? String(params.pendingCount) : null,
    };
  }

  it("formats relative timestamps accurately", () => {
    expect(formatRelativeSync(null)).toBe("just now");
    expect(formatRelativeSync(new Date().toISOString())).toBe("just now");

    const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    expect(formatRelativeSync(twoMinsAgo)).toBe("2 min ago");

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeSync(twoHoursAgo)).toBe("2h ago");
  });

  it("evaluates syncing state properly", () => {
    const chip = getChipDescriptor({
      isOffline: false,
      isSyncing: true,
      pendingCount: 4,
      lastSyncAt: null,
    });
    expect(chip.mode).toBe("syncing");
    expect(chip.text).toBe("Syncing...");
    expect(chip.hasBadge).toBe(true);
    expect(chip.badgeText).toBe("4");
  });

  it("evaluates offline state with pending counts", () => {
    const chip = getChipDescriptor({
      isOffline: true,
      isSyncing: false,
      pendingCount: 7,
      lastSyncAt: null,
    });
    expect(chip.mode).toBe("offline");
    expect(chip.text).toBe("Offline · 7 pending");
    expect(chip.hasBadge).toBe(true);
    expect(chip.badgeText).toBe("7");
  });

  it("evaluates online state with clean outbox", () => {
    const chip = getChipDescriptor({
      isOffline: false,
      isSyncing: false,
      pendingCount: 0,
      lastSyncAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });
    expect(chip.mode).toBe("online");
    expect(chip.text).toBe("Online · synced 5 min ago");
    expect(chip.hasBadge).toBe(false);
  });
});
