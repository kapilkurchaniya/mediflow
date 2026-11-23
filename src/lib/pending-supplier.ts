export const PENDING_SUPPLIER_PLACEHOLDER_NAME = "__UNREGISTERED_SUPPLIER_PENDING__";

export interface PendingSupplierMeta {
  name: string;
  gstin?: string | null;
  phone?: string | null;
  drugLicenseNo?: string | null;
  address?: string | null;
}

export function buildSupplierPrefillQuery(
  meta: PendingSupplierMeta,
  extra?: { returnTo?: string; linkPurchaseId?: string }
): string {
  const params = new URLSearchParams();
  if (meta.name) params.set("name", meta.name);
  if (meta.gstin) params.set("gstin", meta.gstin);
  if (meta.phone) params.set("phone", meta.phone);
  if (meta.drugLicenseNo) params.set("drugLicenseNo", meta.drugLicenseNo);
  if (meta.address) params.set("address", meta.address);
  if (extra?.returnTo) params.set("returnTo", extra.returnTo);
  if (extra?.linkPurchaseId) params.set("linkPurchaseId", extra.linkPurchaseId);
  return params.toString();
}
