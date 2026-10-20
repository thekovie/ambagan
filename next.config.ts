import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server (.next/standalone) for the Docker image; the image copies static files and migrations next to it.
  output: "standalone",
  // Every route behind sign-in is per-user and dynamic, so the app does not use
  // cacheComponents / partial prerendering (it would force Suspense around each session read).
  serverExternalPackages: ["better-sqlite3"],
  // Payment QR uploads go through a Server Action (default cap is 1 MB; the app caps images at 1.5 MB).
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // The Content-Security-Policy (per-request nonce) is set in src/proxy.ts; these cover framing and referrer leaks.
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
          // Browsers ignore this over plain http; over https it keeps them on https.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Private share links: the URL is the credential, so it must never reach a search engine, a cache or another site.
        source: "/s/:path*",
        headers: [
          // same-origin (not no-referrer): the link never reaches another site, but a form post without JavaScript still carries a real Origin.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
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
