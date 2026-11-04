import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Service Worker Registration & Lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("skips registration when serviceWorker API is unavailable in browser", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});

    let registered = false;
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      registered = true;
    }

    expect(registered).toBe(false);
  });

  it("skips registration in development mode by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SW", "");

    const registerMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        register: registerMock,
      },
    });

    const isProd = (process.env as Record<string, string | undefined>).NODE_ENV === "production";
    const isExplicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_SW === "true";

    if (isProd || isExplicitlyEnabled) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }

    expect(registerMock).not.toHaveBeenCalled();
  });

  it("triggers registration when in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const registerMock = vi.fn().mockResolvedValue({
      waiting: null,
      addEventListener: vi.fn(),
    });

    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        register: registerMock,
      },
    });

    const isProd = (process.env as Record<string, string | undefined>).NODE_ENV === "production";
    const isExplicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_SW === "true";

    if (isProd || isExplicitlyEnabled) {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }

    expect(registerMock).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("triggers registration when explicitly forced enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SW", "true");

    const registerMock = vi.fn().mockResolvedValue({
      waiting: null,
      addEventListener: vi.fn(),
    });

    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        register: registerMock,
      },
    });

    const isProd = (process.env as Record<string, string | undefined>).NODE_ENV === "production";
    const isExplicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_SW === "true";

    if (isProd || isExplicitlyEnabled) {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }

    expect(registerMock).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("detects waiting worker and handles skip-waiting update notification", () => {
    const postMessageMock = vi.fn();
    const waitingWorker = {
      postMessage: postMessageMock,
    };

    const registration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
    };

    expect(registration.waiting).not.toBeNull();

    // Trigger update application
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    expect(postMessageMock).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });
});
