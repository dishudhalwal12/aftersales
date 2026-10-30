import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The pure domain core is authored as .ts and imported with explicit
  // extensions so plain `node --test` can run it without a bundler.
  experimental: {
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
  async redirects() {
    return [
      {
        // The rebranded replica IS the landing page: `src/app/page.tsx` was removed
        // so there is exactly one home screen. The filename stays in the URL because
        // the mirrored page resolves its assets relatively.
        source: "/",
        destination: "/landing/index.html",
        permanent: false,
      },
      {
        source: "/landing",
        destination: "/landing/index.html",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
