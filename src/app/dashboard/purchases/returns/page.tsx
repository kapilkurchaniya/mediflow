import { getPurchaseReturns } from "@/app/actions/purchase-returns";
import { ReturnsListClient } from "./ReturnsListClient";

export const dynamic = "force-dynamic";

export default async function PurchaseReturnsPage() {
  const returns = await getPurchaseReturns();
  return <ReturnsListClient returns={returns} />;
}

