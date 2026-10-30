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
        // The mirrored landing page in public/landing references its assets
        // relatively, so the URL has to keep the filename: at `/landing` the
        // browser would look for `/assets/...` and find nothing.
        source: "/landing",
        destination: "/landing/index.html",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
