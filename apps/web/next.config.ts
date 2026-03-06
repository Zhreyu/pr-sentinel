import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@pr-sentinel/database",
    "@pr-sentinel/env",
    "@pr-sentinel/github",
    "@pr-sentinel/queue",
    "@pr-sentinel/ai-analyzer",
  ],
  experimental: {
    typedRoutes: true,
  },
};

export default config;
