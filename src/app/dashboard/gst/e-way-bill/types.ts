export interface EWayBillItem {
  id: string;
  docNo: string;
  docType: string;
  docDate: string;
  partyName: string | null;
  partyGstin: string | null;
  total: number | null;
  taxableAmount: number | null;
  eWayBillNo: string | null;
  eWayBillDate: Date | string | null;
  eWayBillValidTill: Date | string | null;
  vehicleNo: string | null;
  transporterId: string | null;
  transporterName: string | null;
  transportMode: string | null;
  distanceKm: number | null;
  status: string;
  cancelledReason: string | null;
  refType: string | null;
  refId: string | null;
  storeId: string;
  storeName: string | null;
}

export interface ValidityStatus {
  badge: string;
  label: string;
  isUrgent: boolean;
  hoursLeft: number;
  canCancel: boolean;
}

