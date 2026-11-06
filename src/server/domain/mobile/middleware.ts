/** Mobile API Authentication & Store-Scope Authorization Middleware (Lane A: A5.7.2) */
import { NextRequest, NextResponse } from "next/server";
import { db } from "../../db";
import { MobileAuthContext, validateMobileToken } from "./auth";

export interface MobileAuthResult {
  authorized: true;
  context: MobileAuthContext;
}

export interface MobileAuthFailure {
  authorized: false;
  response: NextResponse;
}

export async function requireMobileAuth(
  req: NextRequest,
  options?: {
    allowedRoles?: string[];
    requiredStoreId?: string;
  },
): Promise<MobileAuthResult | MobileAuthFailure> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "UNAUTHORIZED", message: "Missing or invalid Bearer token" },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  const validation = await validateMobileToken(db, token);
  if (!validation.valid) {
    const status = validation.error === "SESSION_REVOKED" || validation.error === "DEVICE_REVOKED" ? 401 : 401;
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: validation.error, message: `Authentication rejected: ${validation.error}` },
        { status },
      ),
    };
  }

  const { context } = validation;

  // Role check if specified
  if (options?.allowedRoles && options.allowedRoles.length > 0) {
    if (!options.allowedRoles.includes(context.role)) {
      return {
        authorized: false,
        response: NextResponse.json(
          { success: false, error: "FORBIDDEN", message: `Role '${context.role}' is not authorized for this resource` },
          { status: 403 },
        ),
      };
    }
  }

  // Store access check if specified
  if (options?.requiredStoreId) {
    if (!context.allStores && !context.storeIds.includes(options.requiredStoreId)) {
      return {
        authorized: false,
        response: NextResponse.json(
          { success: false, error: "STORE_ACCESS_DENIED", message: "User does not have access to this store" },
          { status: 403 },
        ),
      };
    }
  }

  return { authorized: true, context };
}
