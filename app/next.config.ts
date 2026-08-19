import type { NextConfig } from "next";
import { resolve } from "node:path";

const wsShim = resolve(process.cwd(), "src/lib/ws-shim.js");

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  webpack: (config) => {
    config.experiments = {
      ...(config.experiments ?? {}),
      asyncWebAssembly: true,
    };
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "isomorphic-ws": wsShim,
      ws: wsShim,
    };
    return config;
  },
};

export default nextConfig;
