/**
 * src/server/domain/einvoice-provider-factory.ts
 *
 * Resolves the appropriate IRPProvider instance for a tenant based on:
 * - Environment configuration (EINVOICE_MODE: disabled | simulator | sandbox | production)
 * - Tenant-specific encrypted GSP credentials stored in tenant_gsp_credentials
 * - Global GSP fallback credentials from env
 *
 * Lane B (B5.1)
 */

import { schema } from "@/server/db";
import { eq, and, or, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { env } from "@/env";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import {
  type IRPProvider,
  getEInvoiceMode,
} from "./einvoice-types";
import { SimulatedIRPProvider } from "./einvoice-simulator";
import { GspIRPProvider } from "./einvoice-providers/gsp-provider";

export async function resolveIRPProvider(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId?: string;
  }
): Promise<IRPProvider> {
  const mode = getEInvoiceMode();

  if (mode === "disabled") {
    throw new Error(
      "E-invoicing is currently disabled. Set EINVOICE_MODE=simulator for local testing, " +
        "or EINVOICE_MODE=sandbox|production with valid GSP credentials."
    );
  }

  if (mode === "simulator") {
    return new SimulatedIRPProvider();
  }

  const isSandbox = mode === "sandbox";

  // Look up store-specific or tenant-wide credentials
  const conditions = [
    eq(schema.tenantGspCredentials.tenantId, params.tenantId),
    eq(schema.tenantGspCredentials.isSandbox, isSandbox),
  ];

  if (params.storeId) {
    conditions.push(
      or(
        eq(schema.tenantGspCredentials.storeId, params.storeId),
        isNull(schema.tenantGspCredentials.storeId)
      )!
    );
  } else {
    conditions.push(isNull(schema.tenantGspCredentials.storeId));
  }

  const [cred] = await db
    .select()
    .from(schema.tenantGspCredentials)
    .where(and(...conditions))
    .limit(1);

  if (cred) {
    const clientId = decryptSecret(cred.clientIdEnc) ?? "";
    const clientSecret = decryptSecret(cred.clientSecretEnc) ?? "";
    const portalUsername = decryptSecret(cred.portalUsernameEnc) ?? "";
    const portalPassword = decryptSecret(cred.portalPasswordEnc) ?? "";
    const cachedToken = cred.cachedAuthTokenEnc ? (decryptSecret(cred.cachedAuthTokenEnc) ?? null) : null;

    return new GspIRPProvider({
      clientId,
      clientSecret,
      portalUsername,
      portalPassword,
      isSandbox,
      cachedToken,
      tokenExpiresAt: cred.tokenExpiresAt,
      onTokenRefreshed: async (newToken, expiresAt) => {
        try {
          await db
            .update(schema.tenantGspCredentials)
            .set({
              cachedAuthTokenEnc: encryptSecret(newToken),
              tokenExpiresAt: expiresAt,
              updatedAt: new Date(),
            })
            .where(eq(schema.tenantGspCredentials.id, cred.id));
        } catch (err) {
          console.error("Failed to persist refreshed GSP auth token:", err);
        }
      },
    });
  }

  // Fallback to global environment variables
  if (
    env.GSP_CLIENT_ID &&
    env.GSP_CLIENT_SECRET &&
    env.GSP_PORTAL_USERNAME &&
    env.GSP_PORTAL_PASSWORD
  ) {
    return new GspIRPProvider({
      baseUrl: env.GSP_BASE_URL,
      clientId: env.GSP_CLIENT_ID,
      clientSecret: env.GSP_CLIENT_SECRET,
      portalUsername: env.GSP_PORTAL_USERNAME,
      portalPassword: env.GSP_PORTAL_PASSWORD,
      isSandbox,
    });
  }

  throw new Error(
    `E-Invoice mode is '${mode}', but no GSP credentials were found for tenant '${params.tenantId}'. ` +
      "Configure your GSP credentials in Settings > GST or set GSP_* environment variables."
  );
}
