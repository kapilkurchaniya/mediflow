import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() (403 page) used by requirePagePermission in src/server/rbac.ts.
    authInterrupts: true,
  },
  typescript: {
    // Type checking is strictly verified via npm run typecheck
    ignoreBuildErrors: false,
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    process.env.NEXT_PHASE = "phase-production-build";
  }
  return nextConfig;
}
