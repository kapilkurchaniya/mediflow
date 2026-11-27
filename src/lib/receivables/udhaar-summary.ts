export interface UdhaarCustomerRow {
  id: string;
  name: string;
  phone: string | null;
  duePaise: number;
  openBills: number;
}

export interface UdhaarSummary {
  totalToCollectPaise: number;
  customersWithDueCount: number;
  openBillsCount: number;
}

export function computeUdhaarSummary(customers: UdhaarCustomerRow[]): UdhaarSummary {
  let totalToCollectPaise = 0;
  let customersWithDueCount = 0;
  let openBillsCount = 0;

  for (const c of customers) {
    if (c.duePaise > 0) {
      totalToCollectPaise += c.duePaise;
      customersWithDueCount += 1;
      openBillsCount += c.openBills;
    }
  }

  return {
    totalToCollectPaise,
    customersWithDueCount,
    openBillsCount,
  };
}
