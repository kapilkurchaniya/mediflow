export type ConsentPurpose = "transactional" | "marketing" | "reminders";

export type ConsentSource =
  | "pos"
  | "whatsapp"
  | "web"
  | "manual"
  | "privacy_portal"
  | "erasure_request";

export interface CustomerConsentStatus {
  transactional: boolean;
  reminders: boolean;
  marketing: boolean;
  history: Array<{
    id: string;
    purpose: string;
    granted: boolean;
    source: string;
    capturedBy?: string | null;
    notes?: string | null;
    createdAt: Date;
  }>;
}

export interface ExportedCustomerData {
  exportMetadata: {
    exportDate: string;
    statutoryNotice: string;
    tenantId: string;
    customerId: string;
    dpdpComplianceVersion: string;
  };
  profile: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    gstin: string | null;
    stateCode: string | null;
    loyaltyPoints: number;
    creditLimitPaise: number;
    createdAt: Date;
  };
  consents: {
    current: {
      transactional: boolean;
      reminders: boolean;
      marketing: boolean;
    };
    history: Array<{
      id: string;
      purpose: string;
      granted: boolean;
      source: string;
      capturedBy?: string | null;
      notes?: string | null;
      createdAt: Date;
    }>;
  };
  loyalty: {
    balance: number;
    transactions: Array<{
      id: string;
      type: string;
      points: number;
      balanceAfter: number;
      createdAt: Date;
      note?: string | null;
    }>;
  };
  salesSummary: Array<{
    id: string;
    invoiceNo: string | null;
    createdAt: Date;
    totalAmountPaise: number;
    status: string;
    statutoryNotice: string;
  }>;
  prescriptionsSummary: Array<{
    id: string;
    doctorName: string | null;
    createdAt: Date;
    statutoryNotice: string;
  }>;
}
