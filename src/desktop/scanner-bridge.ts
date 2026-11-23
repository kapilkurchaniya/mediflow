/**
 * Native Document Scanner & Watch-Folder Bridge for MediFlow Tauri Desktop.
 *
 * Bridges Tauri IPC commands (`list_scanners`, `scan_document`, `get_scan_watch_folders`,
 * `poll_watch_folder`) into standard `File` instances that feed directly into
 * MediFlow's OCR pipelines (`/api/ocr/grn-invoice`, `/api/ocr/stock-sheet`, `/api/ocr/prescription`).
 */

import { isTauriDesktop } from "./hardware-bridge";

export type ScanWatchChannel = "invoices" | "stock" | "prescriptions";

export interface PhysicalScannerDevice {
  id: string;
  name: string;
  driver: string;
  isDefault: boolean;
}

export interface NativeScannedDocument {
  fileName: string;
  mimeType: string;
  base64Data: string;
  scannerName: string;
  source: "native_scanner" | "watch_folder";
  filePath?: string | null;
}

export interface ScanWatchFolderConfig {
  baseDir: string;
  invoicesDir: string;
  stockDir: string;
  prescriptionsDir: string;
}

interface TauriInternals {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

function getTauriInvoke(): TauriInternals["invoke"] | null {
  if (typeof window === "undefined") return null;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  return internals?.invoke ?? null;
}

export function isPhysicalScannerAvailable(): boolean {
  return isTauriDesktop() && getTauriInvoke() !== null;
}

/**
 * Converts a base64 payload returned from Tauri Rust into a standard File object.
 */
export function base64ToFile(base64Data: string, fileName: string, mimeType: string): File {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

export async function listPhysicalScanners(): Promise<PhysicalScannerDevice[]> {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  return invoke<PhysicalScannerDevice[]>("list_scanners");
}

export async function scanFromPhysicalScanner(options?: {
  scannerId?: string;
  driver?: string;
  dpi?: number;
  format?: "png" | "jpg" | "pdf";
}): Promise<{ file: File; meta: NativeScannedDocument }> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    throw new Error(
      "Direct hardware scanning requires the MediFlow Desktop (Tauri) app. Upload an image/PDF or use your camera in browser mode."
    );
  }
  const doc = await invoke<NativeScannedDocument>("scan_document", {
    scannerId: options?.scannerId ?? null,
    driver: options?.driver ?? null,
    dpi: options?.dpi ?? 200,
    format: options?.format ?? "png",
  });
  const file = base64ToFile(doc.base64Data, doc.fileName, doc.mimeType);
  return { file, meta: doc };
}

export async function getScanWatchFolders(): Promise<ScanWatchFolderConfig | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<ScanWatchFolderConfig>("get_scan_watch_folders");
}

export async function pollWatchedScans(
  channel: ScanWatchChannel
): Promise<Array<{ file: File; meta: NativeScannedDocument }>> {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  const docs = await invoke<NativeScannedDocument[]>("poll_watch_folder", { channel });
  return docs.map((meta) => ({
    file: base64ToFile(meta.base64Data, meta.fileName, meta.mimeType),
    meta,
  }));
}
