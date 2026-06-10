/** @type {import("next").NextConfig} */
const nextConfig = {
  // Keep @bitgetbench/db out of the bundle so its node:sqlite (loaded via createRequire)
  // resolves at runtime in Node. The VPS runs `next start` with the full install.
  serverExternalPackages: ["@bitgetbench/db"],
};

export default nextConfig;
