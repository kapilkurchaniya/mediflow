import { describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { GET } from "@/app/api/health/route";

describe("Health Check API (/api/health)", () => {
  it("returns 200 and healthy when database is reachable", async () => {
    vi.spyOn(db, "execute").mockResolvedValueOnce({} as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.database).toBe("connected");
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("uptimeSeconds");
    expect(data).toHaveProperty("latencyMs");
  });

  it("returns 503 and degraded when database fails to respond", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("Connection refused"));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.database).toBe("unreachable");
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("uptimeSeconds");
  });
});
