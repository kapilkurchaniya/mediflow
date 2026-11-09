import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { getSecurityHeaders } from "./src/server/security/headers";

const nextConfig: NextConfig = {
  output: "standalone",
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
        source: "/(.*)",
        headers: getSecurityHeaders(),
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        // Disable proxy buffering for streaming API routes (SSE / AI chat)
        source: "/api/:path*",
        headers: [
          { key: "X-Accel-Buffering", value: "no" },
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
