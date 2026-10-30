import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The pure domain core is authored as .ts and imported with explicit
  // extensions so plain `node --test` can run it without a bundler.
  experimental: {
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
  async rewrites() {
    // `/` is the saved reference page (public/landing) — the product's front door by
    // decision, not by default. It is a static snapshot of an external site, kept as a
    // visual reference; the app's own landing page is at `/home`. A rewrite, not a
    // redirect: the browser keeps `/` in the address bar while the static page is served
    // from its real path, and its assets are referenced from the site root
    // (`/landing/assets/...`) for exactly this reason.
    return [
      { source: "/", destination: "/landing/index.html" },
      { source: "/landing", destination: "/landing/index.html" },
    ];
  },
};

export default nextConfig;
