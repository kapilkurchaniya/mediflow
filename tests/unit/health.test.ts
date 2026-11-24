import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { GET } from "@/app/api/health/route";

describe("Health Check API (/api/health)", () => {
  it("returns 200 and healthy when database is reachable on readiness probe", async () => {
    vi.spyOn(db, "execute").mockResolvedValueOnce({} as unknown as Awaited<ReturnType<typeof db.execute>>);

    const req = new NextRequest("http://localhost:3000/api/health?probe=readiness");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.database).toBe("connected");
    expect(data).toHaveProperty("latencyMs");
  });

  it("returns 503 and degraded when database fails to respond on readiness probe", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("Connection refused"));

    const req = new NextRequest("http://localhost:3000/api/health?probe=readiness");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.database).toBe("unreachable");
  });

  it("returns 200 liveness independently of database status", async () => {
    // Even if database is failing, process liveness remains healthy so orchestrators don't restart process
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("Database down"));

    const req = new NextRequest("http://localhost:3000/api/health");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("uptimeSeconds");
    expect(data.database).toBeUndefined();
  });
});
