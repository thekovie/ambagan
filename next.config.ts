import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every route behind sign-in is per-user and dynamic, so the app does not use
  // cacheComponents / partial prerendering (it would force Suspense around each session read).
  serverExternalPackages: ["better-sqlite3"],
  // Payment QR uploads go through a Server Action (default cap is 1 MB; the app caps images at 1.5 MB).
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // A CSP with nonces is added with the deployment work; these cover framing and referrer leaks now.
  async headers() {
    return [
      {
        source: "/ocr/:path*",
        // Self-hosted OCR engine and language data: large, and only change with a dependency upgrade.
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
