"use client";

import { useState } from "react";
import { saveWhatsAppConfig } from "@/app/actions/whatsapp";
import { Check, AlertCircle, Key, Phone, ShieldCheck, Globe } from "lucide-react";
import { FormSection, Field } from "@/app/components/ui";

interface WhatsAppConfigData {
  phoneNumberId: string | null;
  businessAccountId: string | null;
  accessToken: string | null;
  webhookVerifyToken: string | null;
  isActive: boolean;
}

export function WhatsAppSettingsClient({ initialConfig }: { initialConfig: WhatsAppConfigData | null }) {
  const [isActive, setIsActive] = useState(initialConfig?.isActive ?? false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setSuccess(false);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("isActive", isActive ? "on" : "off");

    const res = await saveWhatsAppConfig(formData);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setIsPending(false);
  };

  return (
    <form onSubmit={handleSubmit} className="card max-w-4xl space-y-6">
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
            WhatsApp Business API configuration saved successfully.
          </div>
        )}

        <FormSection
          title="Meta Graph API Credentials"
          description="Enter your Meta Developer app credentials to connect directly to WhatsApp Cloud API."
        >
          <Field label="Phone Number ID" htmlFor="phoneNumberId" required hint="Found in Meta App Dashboard > WhatsApp > API Setup">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input
                id="phoneNumberId"
                name="phoneNumberId"
                defaultValue={initialConfig?.phoneNumberId || ""}
                placeholder="102938475610293"
                className="input pl-9 font-mono"
                required
              />
            </div>
          </Field>

          <Field label="WhatsApp Business Account ID (WABA)" htmlFor="businessAccountId" required hint="Found in Meta Business Manager">
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input
                id="businessAccountId"
                name="businessAccountId"
                defaultValue={initialConfig?.businessAccountId || ""}
                placeholder="987654321098765"
                className="input pl-9 font-mono"
                required
              />
            </div>
          </Field>

          <Field label="System User Permanent Access Token" htmlFor="accessToken" required hint="EAAB... bearer token with whatsapp_business_messaging permission" className="sm:col-span-2">
            <textarea
              id="accessToken"
              name="accessToken"
              defaultValue={initialConfig?.accessToken || ""}
              placeholder="EAAB..."
              rows={3}
              className="input font-mono text-xs py-2 w-full"
              required
            />
          </Field>
        </FormSection>

        <FormSection
          title="Webhook Configuration"
          description="Configure these details in your Meta App Dashboard under WhatsApp > Configuration > Edit Webhook."
        >
          <Field label="Webhook Callback URL" hint="Paste this URL in Meta Dashboard" className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value="https://your-domain.com/api/webhooks/whatsapp"
                className="input font-mono text-xs bg-ink-50 flex-1 text-ink-600"
              />
              <span className="badge badge-neutral">POST / GET</span>
            </div>
          </Field>

          <Field label="Webhook Verify Token" htmlFor="webhookVerifyToken" hint="Secret token shared between Meta and MediFlow">
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input
                id="webhookVerifyToken"
                name="webhookVerifyToken"
                defaultValue={initialConfig?.webhookVerifyToken || "mediflow_wa_webhook"}
                placeholder="mediflow_wa_webhook"
                className="input pl-9 font-mono"
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
                <span className="text-sm font-medium text-ink-900 block">Enable WhatsApp Live Integration</span>
                <span className="text-xs text-ink-500 block">
                  When enabled, real API calls are dispatched. If disabled, MediFlow safely logs messages to the test simulator.
                </span>
              </div>
            </label>
          </div>
        </FormSection>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-ink-150 bg-ink-50/60 px-6 py-3.5">
        <button type="submit" disabled={isPending} className="btn btn-primary">
          <Check className="h-4 w-4" /> {isPending ? "Saving…" : "Save API Configuration"}
        </button>
      </div>
    </form>
  );
}
