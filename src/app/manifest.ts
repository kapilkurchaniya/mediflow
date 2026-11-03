import type { MetadataRoute } from "next";

/**
 * Web App Manifest for MediFlow POS PWA.
 * Enables standalone counter desktop & tablet installation under Next.js App Router.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard/sales/pos",
    name: "MediFlow Pharmacy POS",
    short_name: "MediFlow POS",
    description: "Offline-first high-speed pharmacy counter billing",
    start_url: "/dashboard/sales/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#0f172a",
    background_color: "#ffffff",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
