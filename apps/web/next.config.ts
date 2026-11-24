import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@syncspace/contracts"],
  output: "standalone",
  outputFileTracingRoot: root,
  poweredByHeader: false
};

export default nextConfig;
