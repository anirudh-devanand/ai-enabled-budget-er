import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ledger/api-client"],
};

export default nextConfig;
