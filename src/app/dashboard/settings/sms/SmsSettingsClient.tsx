"use client";

import { useState } from "react";
import { saveSmsConfig, sendTestSms } from "@/app/actions/sms";
import { Check, AlertCircle, Send, Key, ShieldCheck } from "lucide-react";
import { FormSection, Field } from "@/app/components/ui";

interface SmsConfigData {
  provider: string;
  apiKey: string | null;
  senderId: string | null;
  isActive: boolean;
}

export function SmsSettingsClient({ initialConfig }: { initialConfig: SmsConfigData | null }) {
  const [provider, setProvider] = useState(initialConfig?.provider || "msg91");
  const [isActive, setIsActive] = useState(initialConfig?.isActive ?? false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Test SMS state
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("MediFlow Pharmacy test notification.");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testPending, setTestPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setSuccess(false);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("provider", provider);
    formData.set("isActive", isActive ? "on" : "off");

    const res = await saveSmsConfig(formData);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setIsPending(false);
  };

  const handleTestSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone) return;
    setTestPending(true);
    setTestResult(null);

    const res = await sendTestSms(testPhone, testMsg);
    if ("error" in res && res.error) {
      setTestResult(`Failed: ${res.error}`);
    } else if ("provider" in res) {
      setTestResult(`SMS Sent successfully via ${res.provider}! (ID: ${res.messageId})`);
    }
    setTestPending(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <form onSubmit={handleSubmit} className="card space-y-6">
        <div className="card-body p-6 space-y-6">
          {error && (
            <div className="alert-error text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="alert-success text-xs">
              <Check className="h-4 w-4 shrink-0" />
              SMS gateway settings saved successfully.
            </div>
          )}

          <FormSection
            title="SMS Gateway Provider"
            description="Select and configure your DLT-registered telecom SMS gateway for India."
          >
            <Field label="Gateway Provider" htmlFor="provider" required>
              <select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="input"
              >
                <option value="msg91">MSG91 (Recommended for India DLT)</option>
                <option value="textlocal">TextLocal India</option>
                <option value="twilio">Twilio Global</option>
              </select>
            </Field>

            <Field label="Approved DLT Sender ID / Header" htmlFor="senderId" required hint="6-alpha approved sender ID (e.g. MEDFLW)">
              <input
                id="senderId"
                name="senderId"
                defaultValue={initialConfig?.senderId || "MEDFLW"}
                placeholder="MEDFLW"
                maxLength={6}
                className="input font-mono uppercase"
              />
            </Field>

            <Field label="API Key / Auth Token" htmlFor="apiKey" required className="sm:col-span-2">
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                <input
                  id="apiKey"
                  type="password"
                  name="apiKey"
                  defaultValue={initialConfig?.apiKey || ""}
                  placeholder="Enter SMS gateway auth token"
                  className="input pl-9 font-mono text-xs"
                />
              </div>
            </Field>

            <div className="sm:col-span-2 pt-2">
              <label className="flex items-center gap-3 p-3.5 rounded-lg border border-ink-150 bg-ink-50/50 cursor-pointer hover:border-ink-300">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="checkbox"
                />
                <div>
                  <span className="text-sm font-medium text-ink-900 block">Enable Live SMS Gateway</span>
                  <span className="text-xs text-ink-500 block">
                    Dispatches live SMS to patient phones. If disabled, SMS notifications log to console in simulator mode.
                  </span>
                </div>
              </label>
            </div>
          </FormSection>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-150 bg-ink-50/60 px-6 py-3.5">
          <button type="submit" disabled={isPending} className="btn btn-primary">
            <Check className="h-4 w-4" /> {isPending ? "Saving…" : "Save SMS Settings"}
          </button>
        </div>
      </form>

      {/* Test SMS Card */}
      <div className="card p-6">
        <h3 className="font-semibold text-sm text-ink-900 mb-1">Test SMS Dispatch</h3>
        <p className="text-xs text-ink-500 mb-4">
          Send an instant test message to verify DLT route and gateway connectivity.
        </p>

        {testResult && (
          <div
            className={`text-xs p-3 rounded-lg mb-4 ${
              testResult.startsWith("Failed") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {testResult}
          </div>
        )}

        <form onSubmit={handleTestSms} className="flex flex-col sm:flex-row gap-2">
          <input
            type="tel"
            required
            placeholder="Recipient Mobile (e.g. 9876543210)"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="input input-sm font-mono sm:w-60"
          />
          <input
            type="text"
            required
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            className="input input-sm flex-1"
          />
          <button
            type="submit"
            disabled={testPending || !testPhone}
            className="btn btn-secondary btn-sm"
          >
            <Send className="h-4 w-4" /> {testPending ? "Sending…" : "Test SMS"}
          </button>
        </form>
      </div>
    </div>
  );
}
