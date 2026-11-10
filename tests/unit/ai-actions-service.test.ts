import { describe, it, expect, vi } from "vitest";
import { createAiProposal, updateAiActionStatus } from "@/server/ai/actions-service";
import type { DbOrTx } from "@/server/db";

describe("MediFlow AI Actions Service (Human-in-the-Loop Proposal Lifecycle)", () => {
  it("creates a pending_confirmation proposal in ai_actions", async () => {
    const mockReturning = vi.fn().mockResolvedValue([
      {
        id: "act-123",
        createdAt: new Date("2026-11-10T12:00:00Z"),
      },
    ]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

    const mockDb = {
      insert: mockInsert,
    } as unknown as DbOrTx;

    const proposal = await createAiProposal(
      {
        tenantId: "t1",
        storeId: "s1",
        userId: "u1",
        tool: "add_medicine",
        intent: "add_medicine",
        summary: 'Add "Dolo 650" to catalogue',
        arguments: { name: "Dolo 650", mrp: 30 },
        payload: { name: "Dolo 650", mrpPaise: 3000 },
        safetyLevel: 2,
      },
      mockDb
    );

    expect(proposal.type).toBe("PROPOSAL");
    expect(proposal.actionId).toBe("act-123");
    expect(proposal.status).toBe("pending_confirmation");
    expect(proposal.intent).toBe("add_medicine");
    expect(proposal.summary).toContain("Dolo 650");
    expect(mockInsert).toHaveBeenCalled();
  });

  it("updates proposal status to confirmed with approvedBy user", async () => {
    const mockReturning = vi.fn().mockResolvedValue([
      {
        id: "act-123",
        status: "confirmed",
        approvedBy: "u1",
      },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

    const mockDb = {
      update: mockUpdate,
    } as unknown as DbOrTx;

    const res = await updateAiActionStatus(
      "act-123",
      "t1",
      "confirmed",
      "u1",
      { medicineId: "med-99" },
      mockDb
    );

    expect(res.status).toBe("confirmed");
    expect(res.approvedBy).toBe("u1");
    expect(mockUpdate).toHaveBeenCalled();
  });
});
