import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Event-store tests reopen real SQLite files; durability is never mocked.
    testTimeout: 30_000,
  },
});
