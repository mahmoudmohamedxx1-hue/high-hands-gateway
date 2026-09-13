import type { NextConfig } from "next";

// NOTE: The World Monitor dev server (Vite on :3001) is proxied by
// src/proxy.ts — see the notes there for why next.config rewrites are not
// used (query-string handling breaks Vite's ?worker/?import transforms).

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
