import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "server-only": new URL("./src/server/ai/server-only.test-shim.ts", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
