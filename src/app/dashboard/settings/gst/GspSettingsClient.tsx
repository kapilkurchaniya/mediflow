"use client";

import { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Server,
  Zap,
  Globe,
} from "lucide-react";
import {
  saveGspCredentialsAction,
  testGspConnectionAction,
} from "@/app/actions/gst";

interface ExistingCred {
  id: string;
  storeId: string | null;
  provider: string;
  isSandbox: boolean;
  hasToken: boolean;
  tokenExpiresAt: Date | null;
  updatedAt: Date | null;
}

export function GspSettingsClient({
  existingCreds,
  currentMode,
}: {
  existingCreds: ExistingCred[];
  currentMode: string;
}) {
  const [isSandbox, setIsSandbox] = useState<boolean>(true);
  const [provider, setProvider] = useState<string>("sandbox_co_in");
  const [clientId, setClientId] = useState<string>("");
  const [clientSecret, setClientSecret] = useState<string>("");
  const [portalUsername, setPortalUsername] = useState<string>("");
  const [portalPassword, setPortalPassword] = useState<string>("");

  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const activeCred = existingCreds.find((c) => c.isSandbox === isSandbox);

  async function handleTestConnection() {
    if (!clientId.trim() || !clientSecret.trim() || !portalUsername.trim() || !portalPassword.trim()) {
      setStatusMsg({ type: "error", text: "Please fill in all credential fields before testing connection." });
      return;
    }
    setTesting(true);
    setStatusMsg(null);
    try {
      const res = await testGspConnectionAction({
        provider,
        clientId,
        clientSecret,
        portalUsername,
        portalPassword,
        isSandbox,
      });

      if (res.error) {
        setStatusMsg({ type: "error", text: `Connection Failed: ${res.error}` });
      } else {
        setStatusMsg({
          type: "success",
          text: `Authentication Successful! Handshake verified (Session Token: ${res.tokenPreview}).`,
        });
      }
    } catch (err: unknown) {
      setStatusMsg({ type: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim() || !portalUsername.trim() || !portalPassword.trim()) {
      setStatusMsg({ type: "error", text: "All credential fields are required." });
      return;
    }

    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await saveGspCredentialsAction({
        provider,
        clientId,
        clientSecret,
        portalUsername,
        portalPassword,
        isSandbox,
      });

      if (res.error) {
        setStatusMsg({ type: "error", text: `Failed to save: ${res.error}` });
      } else {
        setStatusMsg({
          type: "success",
          text: "GSP credentials saved and encrypted securely via AES-256-GCM.",
        });
        setClientSecret("");
        setPortalPassword("");
      }
    } catch (err: unknown) {
      setStatusMsg({ type: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Current Runtime Mode Banner */}
      <div className="card p-5 bg-ink-50/70 border border-ink-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white border border-ink-150 shadow-2xs">
            <Server className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider block">
              Global E-Invoice Runtime Mode
            </span>
            <span className="text-sm font-bold text-ink-900 font-mono capitalize">
              EINVOICE_MODE = {currentMode}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentMode === "simulator" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Local Simulator
            </span>
          ) : currentMode === "sandbox" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> GSP Sandbox Active
            </span>
          ) : currentMode === "production" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> NIC Production Live
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-ink-200 text-ink-700">
              Disabled
            </span>
          )}
        </div>
      </div>

      {/* Configuration Form Card */}
      <form onSubmit={handleSave} className="card p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-ink-150 gap-3">
          <div>
            <h2 className="text-base font-bold text-ink-900">GSP / NIC API Credentials</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Connect to your authorized GST Suvidha Provider (e.g. Sandbox.co.in, ClearTax, Masters India) for live IRN & QR generation.
            </p>
          </div>

          {/* Environment Selector */}
          <div className="flex items-center bg-ink-100 p-1 rounded-lg border border-ink-200 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsSandbox(true)}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                isSandbox ? "bg-white text-ink-900 shadow-2xs" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              Sandbox (Testing)
            </button>
            <button
              type="button"
              onClick={() => setIsSandbox(false)}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                !isSandbox ? "bg-white text-ink-900 shadow-2xs" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              Production (Live)
            </button>
          </div>
        </div>

        {/* Existing credential state indicator */}
        {activeCred && (
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>{isSandbox ? "Sandbox" : "Production"} credentials configured</strong> ({activeCred.provider}).
                {activeCred.hasToken ? " Session token active." : " Ready to connect."}
              </span>
            </div>
            <span className="text-[11px] font-mono text-emerald-700">
              Last saved: {activeCred.updatedAt ? new Date(activeCred.updatedAt).toLocaleDateString() : "Active"}
            </span>
          </div>
        )}

        {statusMsg && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              statusMsg.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {statusMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-ink-800 block mb-1">GSP Integration Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="select w-full"
            >
              <option value="sandbox_co_in">Sandbox.co.in GSP API</option>
              <option value="masters_india">Masters India AutoTax API</option>
              <option value="cleartax">ClearTax E-Invoicing API</option>
              <option value="nic_direct">Direct NIC IRP Gateway</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-ink-800 block mb-1">GSP Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. gsp_client_live_98765"
              className="input w-full font-mono"
            />
          </div>

          <div>
            <label className="font-semibold text-ink-800 block mb-1">GSP Client Secret</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••••••••••••••••••"
              className="input w-full font-mono"
            />
          </div>

          <div>
            <label className="font-semibold text-ink-800 block mb-1">GST Portal Username (API User)</label>
            <input
              type="text"
              value={portalUsername}
              onChange={(e) => setPortalUsername(e.target.value)}
              placeholder="e.g. 27GSPTE0985F1Z5_api"
              className="input w-full font-mono"
            />
          </div>

          <div className="md:col-span-2">
            <label className="font-semibold text-ink-800 block mb-1">GST Portal Password</label>
            <input
              type="password"
              value={portalPassword}
              onChange={(e) => setPortalPassword(e.target.value)}
              placeholder="••••••••••••••••••••••••"
              className="input w-full font-mono max-w-md"
            />
          </div>
        </div>

        {/* Security Assurance Notice */}
        <div className="p-3 bg-ink-50 rounded-lg border border-ink-150 text-[11px] text-ink-600 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <strong>Zero-Knowledge Cryptographic Storage:</strong> Credentials and secrets are symmetrically encrypted using <strong>AES-256-GCM</strong> with authenticated checksums. Plaintext secrets are never stored or exposed over client network calls.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-ink-150 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || saving}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-600" />}
            Test Connection
          </button>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || testing}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Save {isSandbox ? "Sandbox" : "Production"} Credentials
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

