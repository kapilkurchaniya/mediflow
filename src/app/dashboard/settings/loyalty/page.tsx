import { PageHeader } from "@/app/components/ui";
import { getLoyaltyConfig } from "@/app/actions/loyalty";
import { LoyaltySettingsClient } from "./LoyaltySettingsClient";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Loyalty Program Settings — MediFlow",
};

export default async function LoyaltySettingsPage() {
  await requirePagePermission("customer.manage");
  const config = await getLoyaltyConfig();

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/customers"
        title="Customer Loyalty & Rewards"
        description="Configure purchase points accrual rates, redemption cash values, and threshold rules."
      />

      <LoyaltySettingsClient initialConfig={config} />
    </div>
  );
}
