/**
 * src/lib/telemetry-contract.ts
 *
 * Neutral contract module for error boundary telemetry.
 * Does NOT contain "use client" or "use server", allowing safe import
 * from both client components and server actions without crossing boundaries.
 */

export const ALLOWED_MODULES = [
  "dashboard-root",
  "pos",
  "sales",
  "inventory",
  "purchases",
  "accounting",
  "compliance",
  "reports",
  "settings",
] as const;

export type AllowedBoundaryModule = (typeof ALLOWED_MODULES)[number];

export const ALLOWED_EVENT_CODES = [
  "REACT_BOUNDARY_FAILURE",
  "MODULE_INITIALIZATION_ERROR",
] as const;

export type AllowedEventCode = (typeof ALLOWED_EVENT_CODES)[number];

export interface ClientBoundaryErrorPayload {
  module: AllowedBoundaryModule;
  digest?: string;
  code?: AllowedEventCode;
}

export const DIGEST_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
