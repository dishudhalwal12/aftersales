import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The pure domain core is authored as .ts and imported with explicit
  // extensions so plain `node --test` can run it without a bundler.
  experimental: {
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
  async rewrites() {
    // A rewrite, not a redirect: the browser keeps `/` in the address bar while
    // the static page is served from its real path. The mirror's assets are
    // referenced from the site root (`/landing/assets/...`) for exactly this
    // reason — relative paths would resolve against `/` and 404.
    return [
      { source: "/", destination: "/landing/index.html" },
      { source: "/landing", destination: "/landing/index.html" },
    ];
  },
};

export default nextConfig;
