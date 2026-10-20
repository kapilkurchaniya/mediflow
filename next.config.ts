import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() (403 page) used by requirePagePermission in src/server/rbac.ts.
    authInterrupts: true,
  },
};

export default nextConfig;
