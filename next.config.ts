import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every route behind sign-in is per-user and dynamic, so the app does not use
  // cacheComponents / partial prerendering (it would force Suspense around each session read).
  serverExternalPackages: ["better-sqlite3"],
  // A CSP with nonces is added with the deployment work; these cover framing and referrer leaks now.
  async headers() {
    return [
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
