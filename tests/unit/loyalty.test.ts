import { describe, expect, it, vi } from "vitest";
import { LoyaltyService } from "@/server/domain/loyalty";

describe("Loyalty Service (B2.5 Contract)", () => {
  const tenantId = "ten-001";
  const customerId = "cust-001";
  const saleId = "sale-001";

  const activeConfig = {
    id: "cfg-1",
    tenantId,
    pointsPerRupee: 1, // 1 point per ₹100
    redemptionValuePaise: 100, // 1 point = 100 paise = ₹1.00
    minRedemptionPoints: 10,
    isActive: true,
  };

  it("getRedeemable returns 0 points when loyalty config is inactive or null", async () => {
    const mockTx: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // no active config
          }),
        }),
      }),
    };

    const res = await LoyaltyService.getRedeemable(mockTx, tenantId, customerId);
    expect(res).toEqual({ points: 0, valuePaise: 0 });
  });

  it("getRedeemable returns 0 if customer points are below minRedemptionPoints", async () => {
    let callCount = 0;
    const mockTx: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([activeConfig]);
              return Promise.resolve([{ points: 5 }]); // 5 points < min 10
            }),
          }),
        }),
      })),
    };

    const res = await LoyaltyService.getRedeemable(mockTx, tenantId, customerId);
    expect(res).toEqual({ points: 0, valuePaise: 0 });
  });

  it("getRedeemable returns points and correct value in paise when above threshold", async () => {
    let callCount = 0;
    const mockTx: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([activeConfig]);
              return Promise.resolve([{ points: 50 }]); // 50 points
            }),
          }),
        }),
      })),
    };

    const res = await LoyaltyService.getRedeemable(mockTx, tenantId, customerId);
    // 50 points * 100 paise = 5000 paise (₹50)
    expect(res).toEqual({ points: 50, valuePaise: 5000 });
  });

  it("redeemPoints throws when points <= 0 or under minRedemptionPoints", async () => {
    const mockTx: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([activeConfig]),
          }),
        }),
      }),
    };

    await expect(
      LoyaltyService.redeemPoints(mockTx, { tenantId, customerId, points: 0 })
    ).rejects.toThrow("greater than zero");

    await expect(
      LoyaltyService.redeemPoints(mockTx, { tenantId, customerId, points: 5 })
    ).rejects.toThrow("Minimum 10 points required");
  });

  it("redeemPoints throws if customer has insufficient points", async () => {
    let callCount = 0;
    const mockTx: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([activeConfig]);
              return Promise.resolve([{ points: 15 }]); // Has 15, wants 20
            }),
            for: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ points: 15 }]),
            }),
          }),
        }),
      })),
    };

    await expect(
      LoyaltyService.redeemPoints(mockTx, { tenantId, customerId, points: 20 })
    ).rejects.toThrow("Insufficient loyalty points balance (Available: 15)");
  });

  it("redeemPoints successfully updates customer balance and logs transaction", async () => {
    let callCount = 0;
    const updatedValues: any[] = [];
    const insertedValues: any[] = [];

    const mockTx: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([activeConfig]);
              return Promise.resolve([{ points: 100 }]);
            }),
            for: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ points: 100 }]),
            }),
          }),
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => {
          updatedValues.push(val);
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedValues.push(val);
          return Promise.resolve([]);
        }),
      }),
    };

    const res = await LoyaltyService.redeemPoints(mockTx, {
      tenantId,
      customerId,
      points: 25,
      saleId,
    });

    // 25 points * 100 paise = 2500 paise (₹25)
    expect(res).toEqual({
      valuePaise: 2500,
      pointsRedeemed: 25,
      newBalance: 75,
    });

    expect(updatedValues).toEqual([{ loyaltyPoints: 75 }]);
    expect(insertedValues[0]).toMatchObject({
      tenantId,
      customerId,
      type: "redeem",
      points: -25,
      balanceAfter: 75,
      saleId,
    });
  });

  it("earnPoints computes points earned and increments customer balance", async () => {
    let callCount = 0;
    const updatedValues: any[] = [];
    const insertedValues: any[] = [];

    const mockTx: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([activeConfig]);
              return Promise.resolve([{ points: 30 }]);
            }),
            for: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ points: 30 }]),
            }),
          }),
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => {
          updatedValues.push(val);
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedValues.push(val);
          return Promise.resolve([]);
        }),
      }),
    };

    // ₹650 spent = 65,000 paise -> 6 points earned (at 1 pt per ₹100)
    const earned = await LoyaltyService.earnPoints(mockTx, {
      tenantId,
      customerId,
      saleAmountPaise: 65000,
      saleId,
    });

    expect(earned).toBe(6);
    expect(updatedValues).toEqual([{ loyaltyPoints: 36 }]);
    expect(insertedValues[0]).toMatchObject({
      tenantId,
      customerId,
      type: "earn",
      points: 6,
      balanceAfter: 36,
      saleId,
    });
  });

  it("reverseForSale reverses 100% of earned points on cancellation", async () => {
    const updatedValues: any[] = [];
    const insertedValues: any[] = [];

    const mockTx: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            return {
              for: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ points: 40 }]), // current balance 40
              }),
              // when called directly without .for
              then: (resolve: any) =>
                resolve([
                  {
                    id: "tx-1",
                    tenantId,
                    customerId,
                    type: "earn",
                    points: 10,
                    saleId,
                  },
                ]),
            };
          }),
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => {
          updatedValues.push(val);
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedValues.push(val);
          return Promise.resolve([]);
        }),
      }),
    };

    await LoyaltyService.reverseForSale(mockTx, {
      tenantId,
      saleId,
      fraction: 1, // 100% cancel
    });

    // Earned 10 points -> deduct 10: 40 - 10 = 30
    expect(updatedValues).toEqual([{ loyaltyPoints: 30 }]);
    expect(insertedValues[0]).toMatchObject({
      tenantId,
      customerId,
      points: -10,
      balanceAfter: 30,
      saleId,
    });
  });

  it("reverseForSale handles partial returns (e.g. 50% fraction) and refunds redeemed points", async () => {
    const updatedValues: any[] = [];
    const insertedValues: any[] = [];

    const mockTx: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            return {
              for: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ points: 50 }]),
              }),
              then: (resolve: any) =>
                resolve([
                  {
                    id: "tx-1",
                    tenantId,
                    customerId,
                    type: "redeem",
                    points: -20, // 20 points redeemed on this bill
                    saleId,
                  },
                ]),
            };
          }),
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => {
          updatedValues.push(val);
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedValues.push(val);
          return Promise.resolve([]);
        }),
      }),
    };

    await LoyaltyService.reverseForSale(mockTx, {
      tenantId,
      saleId,
      fraction: 0.5, // 50% return
    });

    // 20 points redeemed * 0.5 = 10 points refunded: 50 + 10 = 60
    expect(updatedValues).toEqual([{ loyaltyPoints: 60 }]);
    expect(insertedValues[0]).toMatchObject({
      tenantId,
      customerId,
      points: 10,
      balanceAfter: 60,
      saleId,
    });
  });
});
