/** @type {import("next").NextConfig} */
const nextConfig = {
  // Standalone output so the VPS can run the app without the full node_modules tree.
  output: "standalone",
  // Keep @bitgetbench/db out of the bundle so its node:sqlite (loaded via createRequire)
  // resolves at runtime in Node.
  serverExternalPackages: ["@bitgetbench/db"],
};

export default nextConfig;
