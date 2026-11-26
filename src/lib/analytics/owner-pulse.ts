/**
 * eOwner Executive Depth (M4): Multi-store live owner pulse & 3-year Marg TCO comparator.
 */
export interface StorePulseInput {
  storeId: string;
  storeName: string;
  todaySalesPaise: number;
  cashCollectedPaise: number;
  upiCollectedPaise: number;
  cardCollectedPaise: number;
  creditIssuedPaise: number;
  nearExpiryValuePaise: number;
  lowStockSkuCount: number;
}

export function buildOwnerExecutivePulse(stores: StorePulseInput[]) {
  let totalSalesPaise = 0;
  let totalCashPaise = 0;
  let totalUpiPaise = 0;
  let totalCreditPaise = 0;
  let totalNearExpiryPaise = 0;
  let totalLowStockSkus = 0;

  for (const s of stores) {
    totalSalesPaise += s.todaySalesPaise;
    totalCashPaise += s.cashCollectedPaise;
    totalUpiPaise += s.upiCollectedPaise;
    totalCreditPaise += s.creditIssuedPaise;
    totalNearExpiryPaise += s.nearExpiryValuePaise;
    totalLowStockSkus += s.lowStockSkuCount;
  }

  const rankedStores = [...stores].sort((a, b) => b.todaySalesPaise - a.todaySalesPaise);

  return {
    storeCount: stores.length,
    totalSalesPaise,
    totalCashPaise,
    totalUpiPaise,
    totalCreditPaise,
    totalNearExpiryPaise,
    totalLowStockSkus,
    topStore: rankedStores[0] ?? null,
    rankedStores,
  };
}

export function calculateThreeYearTcoComparison(input: {
  terminals: number;
  margAnnualAmcPerTerminalInr: number;
  margWalletMonthlyInr: number;
  mediflowAnnualPerStoreInr: number;
}) {
  const margYear1 = 18000 + input.terminals * input.margAnnualAmcPerTerminalInr + input.margWalletMonthlyInr * 12;
  const margYear2And3 =
    2 * (input.terminals * input.margAnnualAmcPerTerminalInr + input.margWalletMonthlyInr * 12);
  const margThreeYearInr = margYear1 + margYear2And3;
  const mediflowThreeYearInr = 3 * input.mediflowAnnualPerStoreInr;

  return {
    margThreeYearInr,
    mediflowThreeYearInr,
    savingsInr: margThreeYearInr - mediflowThreeYearInr,
  };
}
