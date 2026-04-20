import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Silence pino-pretty warning from wagmi/viem in the Next build.
  webpack: (config) => {
    // Silence benign "module not found" warnings from wagmi/MetaMask SDK's
    // cross-platform (react-native) imports that we never actually hit in the
    // browser build.
    config.externals.push(
      "pino-pretty",
      "lokijs",
      "encoding",
      "@react-native-async-storage/async-storage"
    );
    return config;
  },
};

export default nextConfig;
