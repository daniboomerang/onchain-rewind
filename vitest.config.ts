import { defineConfig } from "vitest/config";

// Default environment is node (engine and server tests). Component tests opt in to a DOM
// with a first-line comment: `// @vitest-environment happy-dom`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
  },
});
