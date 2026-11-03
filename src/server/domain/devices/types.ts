import { createHash, randomBytes } from "node:crypto";
import { DomainError } from "@/server/errors";

export interface DeviceAuthCtx {
  tenantId: string;
  storeId: string;
  deviceId: string;
  code: string;
  name: string;
  platform: "browser" | "desktop" | "mobile";
}

export interface RegisterDeviceParams {
  storeId: string;
  code: string;
  name: string;
  platform?: "browser" | "desktop" | "mobile";
  appVersion?: string;
}

export interface RotateDeviceTokenParams {
  deviceId: string;
}

export interface RevokeDeviceParams {
  deviceId: string;
  reason?: string;
}

export function hashDeviceToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function generateDeviceToken(): string {
  return `mf_dev_${randomBytes(32).toString("hex")}`;
}

export function validateDeviceCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length !== 2 || !/^[0-9A-Z]{2}$/.test(trimmed)) {
    throw new DomainError(
      "INVALID_DEVICE_CODE",
      "Device code must be exactly 2 uppercase alphanumeric characters (01-99, A1-Z9).",
    );
  }
  return trimmed;
}
