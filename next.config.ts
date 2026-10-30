import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The pure domain core is authored as .ts and imported with explicit
  // extensions so plain `node --test` can run it without a bundler.
  experimental: {
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
  async rewrites() {
    // `/` is our own landing page (src/app/page.tsx). `/landing` still serves the saved
    // reference snapshot, whose assets are referenced from the site root
    // (`/landing/assets/...`) — it is a design reference, not the product.
    return [{ source: "/landing", destination: "/landing/index.html" }];
  },
};

export default nextConfig;
