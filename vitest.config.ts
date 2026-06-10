import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.{test,spec}.ts",
      "db/**/*.{test,spec}.ts",
      "reference-agents/**/*.{test,spec}.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // node:sqlite is a very new builtin that Vite does not yet auto-externalize.
    server: { deps: { external: [/node:sqlite/] } },
  },
});
