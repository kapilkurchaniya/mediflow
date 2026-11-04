import { describe, it, expect } from "vitest";
import { classifyRequest } from "@/app/dashboard/sales/pos/_offline/sw-routing";

describe("Service Worker Route Classifier", () => {
  it("routes all /api/* requests strictly as network-only", () => {
    expect(classifyRequest("https://example.com/api/sync/pull", "cors", {})).toBe("network-only");
    expect(classifyRequest("https://example.com/api/sync/sales", "cors", {})).toBe("network-only");
    expect(classifyRequest("https://example.com/api/auth/session", "cors", {})).toBe("network-only");
  });

  it("never routes Next.js RSC Flight requests to offline HTML fallback", () => {
    // RSC query param
    expect(
      classifyRequest(
        "https://example.com/dashboard/sales/pos?_rsc=abc123",
        "navigate",
        {},
      ),
    ).toBe("network-only");

    // RSC header
    expect(
      classifyRequest(
        "https://example.com/dashboard/sales/pos",
        "navigate",
        { RSC: "1" },
      ),
    ).toBe("network-only");

    // Next-Router-State-Tree header
    expect(
      classifyRequest(
        "https://example.com/dashboard/sales/pos",
        "navigate",
        { "Next-Router-State-Tree": "..." },
      ),
    ).toBe("network-only");
  });

  it("routes static hashed assets, fonts, icons, and bundles as cache-first", () => {
    expect(
      classifyRequest("https://example.com/_next/static/chunks/main.js", "no-cors", {}),
    ).toBe("cache-first");

    expect(
      classifyRequest("https://example.com/icons/icon-192.png", "no-cors", {}),
    ).toBe("cache-first");

    expect(
      classifyRequest("https://example.com/fonts/inter.woff2", "no-cors", {}),
    ).toBe("cache-first");
  });

  it("routes POS document navigation to pos-navigation-fallback", () => {
    expect(
      classifyRequest("https://example.com/dashboard/sales/pos", "navigate", {}),
    ).toBe("pos-navigation-fallback");
  });

  it("routes non-POS navigations strictly as network-only", () => {
    expect(
      classifyRequest("https://example.com/dashboard/accounting", "navigate", {}),
    ).toBe("network-only");

    expect(
      classifyRequest("https://example.com/dashboard/settings", "navigate", {}),
    ).toBe("network-only");
  });

  it("routes non-GET requests as network-only", () => {
    expect(
      classifyRequest("https://example.com/dashboard/sales/pos", "navigate", {}, "POST"),
    ).toBe("network-only");
  });
});
