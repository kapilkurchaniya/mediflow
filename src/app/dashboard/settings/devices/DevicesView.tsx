"use client";

import { useMemo, useState } from "react";
import {
  Globe,
  KeyRound,
  Laptop,
  Plus,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import type { Device } from "@/server/db/schema/devices";
import { RegisterDeviceModal, type StoreItem } from "./RegisterDeviceModal";
import { OneTimeTokenModal } from "./OneTimeTokenModal";
import { RotateTokenModal } from "./RotateTokenModal";
import { RevokeDeviceModal } from "./RevokeDeviceModal";

interface DevicesViewProps {
  initialStores: StoreItem[];
  initialDevices: Device[];
  currentStoreId?: string;
}

function formatLastSeen(date: Date | string | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DevicesView({
  initialStores,
  initialDevices,
  currentStoreId,
}: DevicesViewProps) {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    currentStoreId || initialStores[0]?.id || "",
  );

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [deviceToRotate, setDeviceToRotate] = useState<Device | null>(null);
  const [deviceToRevoke, setDeviceToRevoke] = useState<Device | null>(null);
  const [oneTimeTokenData, setOneTimeTokenData] = useState<{
    deviceName: string;
    deviceCode: string;
    rawToken: string;
    isRotation?: boolean;
  } | null>(null);

  const filteredDevices = useMemo(() => {
    if (!selectedStoreId || selectedStoreId === "ALL") return devices;
    return devices.filter((d) => d.storeId === selectedStoreId);
  }, [devices, selectedStoreId]);

  const storeMap = useMemo(() => {
    return new Map(initialStores.map((s) => [s.id, s.name]));
  }, [initialStores]);

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "desktop":
        return <Laptop className="h-3.5 w-3.5 text-purple-600" />;
      case "mobile":
        return <Smartphone className="h-3.5 w-3.5 text-amber-600" />;
      default:
        return <Globe className="h-3.5 w-3.5 text-sky-600" />;
    }
  };

  return (
    <div className="page space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          eyebrow="Settings"
          title="Billing Terminals & Devices"
          description="Register and manage physical counter workstations and offline POS pairing credentials."
        />
        <button
          type="button"
          onClick={() => setShowRegisterModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Register Terminal</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-ink-150 bg-white">
        <div className="flex items-center gap-2.5">
          <label className="text-xs font-medium text-ink-700">Filter Store:</label>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="text-xs rounded-lg border border-ink-200 p-2 text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
          >
            <option value="ALL">All Stores & Hubs</option>
            {initialStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-ink-500">
          Showing <strong>{filteredDevices.length}</strong> registered terminal
          {filteredDevices.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="rounded-xl border border-ink-150 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-ink-100 bg-ink-50/50 text-ink-500 uppercase tracking-wider font-medium">
            <tr>
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Terminal Name</th>
              <th className="py-3 px-4">Platform</th>
              <th className="py-3 px-4">Store / Branch</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Last Seen</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {filteredDevices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-ink-400">
                  No terminals registered for this store.
                </td>
              </tr>
            ) : (
              filteredDevices.map((device) => {
                const isRevoked = !!device.revokedAt;
                return (
                  <tr key={device.id} className="hover:bg-ink-50/40 transition">
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                        {device.code}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-ink-900">
                      {device.name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink-100/60 text-ink-700 capitalize">
                        {getPlatformIcon(device.platform)}
                        {device.platform}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-ink-600">
                      {storeMap.get(device.storeId) || "Unknown Store"}
                    </td>
                    <td className="py-3 px-4">
                      {isRevoked ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-ink-500">
                      {formatLastSeen(device.lastSeenAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isRevoked ? (
                        <span className="text-ink-400 text-[11px]">No actions</span>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDeviceToRotate(device)}
                            title="Rotate Pairing Key"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:text-ink-900 border border-ink-200 hover:bg-ink-50 rounded transition"
                          >
                            <KeyRound className="h-3 w-3 text-amber-600" />
                            <span>Rotate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeviceToRevoke(device)}
                            title="Revoke Access"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:text-rose-800 border border-rose-200 hover:bg-rose-50 rounded transition"
                          >
                            <ShieldAlert className="h-3 w-3 text-rose-600" />
                            <span>Revoke</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showRegisterModal && (
        <RegisterDeviceModal
          stores={initialStores}
          defaultStoreId={selectedStoreId !== "ALL" ? selectedStoreId : ""}
          onSuccess={() => {
            setShowRegisterModal(false);
            window.location.reload();
          }}
          onClose={() => setShowRegisterModal(false)}
        />
      )}

      {deviceToRotate && (
        <RotateTokenModal
          device={deviceToRotate}
          onSuccess={(data) => {
            setDeviceToRotate(null);
            setOneTimeTokenData({ ...data, isRotation: true });
          }}
          onClose={() => setDeviceToRotate(null)}
        />
      )}

      {deviceToRevoke && (
        <RevokeDeviceModal
          device={deviceToRevoke}
          onSuccess={(updated) => {
            setDeviceToRevoke(null);
            setDevices((prev) =>
              prev.map((d) => (d.id === updated.id ? updated : d)),
            );
          }}
          onClose={() => setDeviceToRevoke(null)}
        />
      )}

      {oneTimeTokenData && (
        <OneTimeTokenModal
          deviceName={oneTimeTokenData.deviceName}
          deviceCode={oneTimeTokenData.deviceCode}
          rawToken={oneTimeTokenData.rawToken}
          isRotation={oneTimeTokenData.isRotation}
          onClose={() => {
            setOneTimeTokenData(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
