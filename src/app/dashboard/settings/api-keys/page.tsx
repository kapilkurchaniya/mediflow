import { listApiKeys } from "@/app/actions/api-keys";
import { ApiKeysClient } from "./ApiKeysClient";

export const metadata = {
  title: "API Keys — MediFlow Settings",
  description: "Manage machine-to-machine API keys for external integrations.",
};

export default async function ApiKeysPage() {
  const keys = await listApiKeys();
  return <ApiKeysClient initialKeys={keys} />;
}
