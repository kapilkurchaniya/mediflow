import { describe, it, expect } from "vitest";
import manifest from "@/app/manifest";

describe("PWA Web App Manifest", () => {
  it("generates a valid metadata manifest for POS installation", () => {
    const data = manifest();

    expect(data.name).toBe("MediFlow Pharmacy POS");
    expect(data.short_name).toBe("MediFlow POS");
    expect(data.start_url).toBe("/dashboard/sales/pos");
    expect(data.scope).toBe("/");
    expect(data.display).toBe("standalone");
    expect(data.theme_color).toBe("#0f172a");
    expect(data.background_color).toBe("#ffffff");

    expect(data.icons).toHaveLength(2);
    expect(data.icons?.[0]).toEqual({
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    });
    expect(data.icons?.[1]).toEqual({
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    });
  });
});
