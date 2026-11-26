const ALLOWED_PURCHASE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".csv", ".txt", ".xlsx"];

let pendingPurchaseImportFile: File | null = null;

export function isSupportedPurchaseBillFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (ALLOWED_PURCHASE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  const mime = (file.type || "").toLowerCase();
  return (
    mime === "application/pdf" ||
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "text/csv" ||
    mime === "text/plain" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

export function setPendingPurchaseImportFile(file: File): void {
  pendingPurchaseImportFile = file;
}

export function consumePendingPurchaseImportFile(): File | null {
  const f = pendingPurchaseImportFile;
  pendingPurchaseImportFile = null;
  return f;
}
