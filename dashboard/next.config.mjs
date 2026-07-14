/** @type {import('next').NextConfig} */
const nextConfig = {
  // The engine core lives in ../src (outside this app dir) — allow importing it.
  experimental: { externalDir: true },
  // The engine uses NodeNext (.js import specifiers pointing at .ts files). Map them so
  // webpack resolves ../src/lib/benchcore.js → benchcore.ts, etc. Same trick as tsconfig NodeNext.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  // Internal test tool: the engine (NodeNext) and the app (bundler) use different module
  // configs; skip cross-config type-checking at build. Types are still checked in the engine repo.
  typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
