import { getExpiryReturnCandidatesAction } from "@/app/actions/purchase-returns";
import { ExpiryReturnsClient } from "./ExpiryReturnsClient";

export const dynamic = "force-dynamic";

export default async function ExpiryReturnsPage() {
  const candidates = await getExpiryReturnCandidatesAction(60);
  return <ExpiryReturnsClient candidates={candidates} />;
}

