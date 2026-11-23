"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Printer,
  FolderSync,
  Loader2,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Camera,
  RefreshCw,
} from "lucide-react";
import {
  getScanWatchFolders,
  isPhysicalScannerAvailable,
  listPhysicalScanners,
  pollWatchedScans,
  scanFromPhysicalScanner,
  type PhysicalScannerDevice,
  type ScanWatchChannel,
  type ScanWatchFolderConfig,
} from "@/desktop/scanner-bridge";

interface PhysicalScannerButtonProps {
  channel: ScanWatchChannel;
  onScannedFile: (file: File) => void;
  label?: string;
  size?: "xs" | "sm";
  disabled?: boolean;
}

export function PhysicalScannerButton({
  channel,
  onScannedFile,
  label = "Physical Scanner",
  size = "xs",
  disabled = false,
}: PhysicalScannerButtonProps) {
  const isDesktop = useSyncExternalStore(
    () => () => {},
    () => isPhysicalScannerAvailable(),
    () => false
  );
  const [openMenu, setOpenMenu] = useState(false);
  const [scanners, setScanners] = useState<PhysicalScannerDevice[]>([]);
  const [selectedScannerId, setSelectedScannerId] = useState<string>("");
  const [dpi, setDpi] = useState<number>(200);
  const [watchFolders, setWatchFolders] = useState<ScanWatchFolderConfig | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fallbackCameraRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenu]);

  const refreshDevices = async () => {
    if (!isDesktop) return;
    setIsLoadingDevices(true);
    setErrorMsg(null);
    try {
      const [devs, folders] = await Promise.all([
        listPhysicalScanners(),
        getScanWatchFolders(),
      ]);
      setScanners(devs);
      setWatchFolders(folders);
      if (devs.length > 0 && !selectedScannerId) {
        const def = devs.find((d) => d.isDefault) || devs[0];
        setSelectedScannerId(def.id);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to query scanners");
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handleDirectScan = async () => {
    setIsScanning(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const selected = scanners.find((s) => s.id === selectedScannerId);
      const { file, meta } = await scanFromPhysicalScanner({
        scannerId: selected?.id || undefined,
        driver: selected?.driver || undefined,
        dpi,
        format: "png",
      });
      setStatusMsg(`Captured from ${meta.scannerName}`);
      setOpenMenu(false);
      onScannedFile(file);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Physical scan failed");
    } finally {
      setIsScanning(false);
    }
  };

  const handleCheckWatchFolder = async () => {
    setIsScanning(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const found = await pollWatchedScans(channel);
      if (found.length === 0) {
        setStatusMsg("No new scanned files waiting in watch folder.");
      } else {
        setStatusMsg(`Imported ${found[0].meta.fileName} from watch folder.`);
        setOpenMenu(false);
        onScannedFile(found[0].file);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Could not read watch folder");
    } finally {
      setIsScanning(false);
    }
  };

  const watchPath =
    channel === "invoices"
      ? watchFolders?.invoicesDir || "~/MediFlowScans/invoices"
      : channel === "stock"
      ? watchFolders?.stockDir || "~/MediFlowScans/stock"
      : watchFolders?.prescriptionsDir || "~/MediFlowScans/prescriptions";

  return (
    <div ref={containerRef} className="relative inline-flex">
      <input
        ref={fallbackCameraRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setOpenMenu(false);
            onScannedFile(f);
          }
          e.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={disabled || isScanning}
        onClick={() => {
          const next = !openMenu;
          setOpenMenu(next);
          if (next && isDesktop) {
            void refreshDevices();
          }
        }}
        className={`btn btn-secondary ${
          size === "sm" ? "btn-sm text-xs" : "btn-xs text-xs"
        } inline-flex items-center gap-1.5 border-ink-300 text-ink-800 hover:bg-ink-50`}
        title="Scan directly from a connected flatbed/ADF document scanner (Tauri Desktop) or watch folder"
      >
        {isScanning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
        ) : (
          <Printer className="h-3.5 w-3.5 text-brand-600" />
        )}
        <span>{isScanning ? "Scanning…" : label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {openMenu && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-80 rounded-xl border border-ink-200 bg-white shadow-xl p-3.5 space-y-3 text-left text-xs">
          <div className="flex items-center justify-between">
            <div className="font-bold text-ink-900">
              {isDesktop ? "Desktop Document Scanner" : "Physical Scanner (Desktop App)"}
            </div>
            {isDesktop && (
              <button
                type="button"
                onClick={() => void refreshDevices()}
                disabled={isLoadingDevices}
                className="text-brand-700 hover:underline inline-flex items-center gap-1 text-[11px]"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingDevices ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusMsg && !errorMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800 flex items-start gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
              <span>{statusMsg}</span>
            </div>
          )}

          {isDesktop ? (
            <>
              <div className="space-y-2">
                <div>
                  <label className="label text-[11px]">Connected Scanner (WIA / TWAIN / SANE / AirScan)</label>
                  <select
                    value={selectedScannerId}
                    onChange={(e) => setSelectedScannerId(e.target.value)}
                    className="input !h-8 text-xs"
                  >
                    {scanners.length === 0 ? (
                      <option value="">Default System Scanner</option>
                    ) : (
                      scanners.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.driver})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] text-ink-600">Resolution:</label>
                  <select
                    value={dpi}
                    onChange={(e) => setDpi(Number(e.target.value))}
                    className="input !h-7 text-xs w-28"
                  >
                    <option value={150}>150 DPI (Fast)</option>
                    <option value={200}>200 DPI (OCR)</option>
                    <option value={300}>300 DPI (Crisp)</option>
                  </select>
                </div>

                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => void handleDirectScan()}
                  className="btn btn-primary btn-xs w-full justify-center"
                >
                  {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                  Acquire Page from Scanner
                </button>
              </div>

              <div className="pt-2.5 border-t border-ink-150 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-800">Scan-to-Folder Auto Ingest</span>
                </div>
                <p className="text-[11px] text-ink-500 leading-snug">
                  Point your Canon/HP/Epson scanner&apos;s hardware button to save into{" "}
                  <code className="px-1 py-0.5 rounded bg-ink-100 text-ink-800 font-mono text-[10px] break-all">
                    {watchPath}
                  </code>
                </p>
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => void handleCheckWatchFolder()}
                  className="btn btn-secondary btn-xs w-full justify-center"
                >
                  <FolderSync className="h-3.5 w-3.5" />
                  Import Latest from Watch Folder
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2.5 text-[11.5px] text-ink-600">
              <p className="leading-snug">
                Direct USB/Wi-Fi flatbed &amp; ADF scanner control (WIA, TWAIN, SANE, eSCL AirScan) and automatic{" "}
                <code className="px-1 py-0.5 rounded bg-ink-100 font-mono text-[10px]">{watchPath}</code> folder ingestion are active inside the{" "}
                <strong>MediFlow Desktop (Tauri)</strong> app.
              </p>
              <p className="leading-snug text-ink-500">
                In browser mode, capture via device camera or select a scanned image/PDF directly:
              </p>
              <button
                type="button"
                onClick={() => fallbackCameraRef.current?.click()}
                className="btn btn-primary btn-xs w-full justify-center"
              >
                <Camera className="h-3.5 w-3.5" />
                Capture via Camera / Pick Scanned File
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
