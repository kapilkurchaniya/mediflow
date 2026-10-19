"use client";

import { useState } from "react";
import { saveLoyaltyConfig } from "@/app/actions/loyalty";
import { Award, Check, AlertCircle, Coins, Gift, Sparkles } from "lucide-react";
import { FormSection, Field } from "@/app/components/ui";

interface LoyaltyConfigData {
  pointsPerRupee: number;
  redemptionValuePaise: number;
  minRedemptionPoints: number;
  isActive: boolean;
}

export function LoyaltySettingsClient({ initialConfig }: { initialConfig: LoyaltyConfigData | null }) {
  const [isActive, setIsActive] = useState(initialConfig?.isActive ?? true);
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

    const res = await saveLoyaltyConfig(formData);
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
            Loyalty program settings saved successfully.
          </div>
        )}

        <FormSection
          title="Points Accrual Rules"
          description="Define how customers earn reward points on retail sales."
        >
          <Field label="Earning Ratio" htmlFor="pointsPerRupee" required hint="Points awarded per ₹100 of billed sales">
            <div className="relative">
              <Coins className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input
                id="pointsPerRupee"
                type="number"
                min="1"
                max="50"
                name="pointsPerRupee"
                defaultValue={initialConfig?.pointsPerRupee || 1}
                className="input pl-9 font-mono"
                required
              />
            </div>
          </Field>

          <Field label="Point Redemption Value (₹)" htmlFor="redemptionValueRupees" required hint="Rupee discount per point redeemed (e.g. ₹1.00)">
            <div className="relative">
              <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input
                id="redemptionValueRupees"
                type="number"
                step="0.05"
                min="0.1"
                name="redemptionValueRupees"
                defaultValue={(initialConfig?.redemptionValuePaise ? initialConfig.redemptionValuePaise / 100 : 1.0).toFixed(2)}
                className="input pl-9 font-mono"
                required
              />
            </div>
          </Field>

          <Field label="Minimum Points to Redeem" htmlFor="minRedemptionPoints" required hint="Threshold before cashier can apply points at POS" className="sm:col-span-2">
            <input
              id="minRedemptionPoints"
              type="number"
              min="1"
              name="minRedemptionPoints"
              defaultValue={initialConfig?.minRedemptionPoints || 10}
              className="input font-mono"
              required
            />
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
                <span className="text-sm font-medium text-ink-900 block">Enable Customer Rewards & Loyalty</span>
                <span className="text-xs text-ink-500 block">
                  Automatically tracks points on counter sales and prompts cashiers with redemption opportunities during checkout.
                </span>
              </div>
            </label>
          </div>
        </FormSection>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-ink-150 bg-ink-50/60 px-6 py-3.5">
        <button type="submit" disabled={isPending} className="btn btn-primary">
          <Check className="h-4 w-4" /> {isPending ? "Saving…" : "Save Loyalty Settings"}
        </button>
      </div>
    </form>
  );
}
