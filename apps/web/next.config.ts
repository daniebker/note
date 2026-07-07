import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained build for Docker; traces files from the monorepo root.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ["pi5.local", "pi5"],
};

export default nextConfig;
