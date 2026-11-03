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
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    process.env.NEXT_PHASE = "phase-production-build";
  }
  return nextConfig;
}
