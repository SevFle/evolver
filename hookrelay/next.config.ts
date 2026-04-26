import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
