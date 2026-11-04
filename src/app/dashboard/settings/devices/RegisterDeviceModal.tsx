"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Monitor, Sparkles, X } from "lucide-react";
import { getNextDeviceCodeAction, registerDeviceAction } from "@/app/actions/devices";

export interface StoreItem {
  id: string;
  name: string;
  code: string;
}

interface RegisterDeviceModalProps {
  stores: StoreItem[];
  defaultStoreId: string;
  onSuccess: (data: { deviceName: string; deviceCode: string; rawToken: string }) => void;
  onClose: () => void;
}

export function RegisterDeviceModal({
  stores,
  defaultStoreId,
  onSuccess,
  onClose,
}: RegisterDeviceModalProps) {
  const [storeId, setStoreId] = useState(defaultStoreId || stores[0]?.id || "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<"browser" | "desktop" | "mobile">("browser");
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [suggesting, setSuggesting] = useState(false);

  const fetchNextCode = async (targetStoreId: string) => {
    if (!targetStoreId) return;
    setSuggesting(true);
    try {
      const nextCode = await getNextDeviceCodeAction(targetStoreId);
      setCode(nextCode);
    } catch {
      // ignore
    } finally {
      setSuggesting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (storeId) {
      getNextDeviceCodeAction(storeId)
        .then((next) => {
          if (!cancelled && next) {
            setCode((prev) => (prev ? prev : next));
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode || cleanCode.length !== 2 || !/^[0-9A-Z]{2}$/.test(cleanCode)) {
      setError("Device code must be exactly 2 alphanumeric characters (e.g. 01, 02, A1).");
      return;
    }
    if (!name.trim()) {
      setError("Please provide a name for this terminal.");
      return;
    }

    startTransition(async () => {
      const res = await registerDeviceAction({
        storeId,
        code: cleanCode,
        name: name.trim(),
        platform,
        appVersion: appVersion.trim() || undefined,
      });

      if (res?.data?.success && res.data.rawToken) {
        onSuccess({
          deviceName: res.data.device.name,
          deviceCode: res.data.device.code,
          rawToken: res.data.rawToken,
        });
      } else {
        setError(res?.serverError || "Failed to register terminal. Please try again.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-ink-150 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-brand-600" />
            <h3 className="text-base font-semibold text-ink-900">Register Billing Terminal</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-700">Assigned Store / Branch</label>
            <select
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                fetchNextCode(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-ink-700">
                Device Code <span className="text-ink-400">(2 uppercase chars: 01-99, A1-Z9)</span>
              </label>
              <button
                type="button"
                onClick={() => fetchNextCode(storeId)}
                disabled={suggesting}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700"
              >
                <Sparkles className="h-3 w-3" />
                <span>Suggest next</span>
              </button>
            </div>
            <input
              type="text"
              maxLength={2}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="01"
              className="mt-1 w-full rounded-lg border border-ink-200 p-2 font-mono text-sm tracking-wider text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500 uppercase"
            />
            <p className="mt-1 text-[11px] text-ink-500">
              Prefixes offline invoice series (<code className="font-mono">sale:dev{code || "XX"}</code>). Permanently allocated.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-700">Terminal Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Counter 1 - Front Checkout"
              className="mt-1 w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-700">Platform</label>
              <select
                value={platform}
                onChange={(e) =>
                  setPlatform(
                    e.target.value as "browser" | "desktop" | "mobile",
                  )
                }
                className="mt-1 w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="browser">Browser PWA</option>
                <option value="desktop">Desktop (Tauri)</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700">App Version</label>
              <input
                type="text"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
                placeholder="1.0.0"
                className="mt-1 w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-ink-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-3.5 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || suggesting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Register Terminal</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
