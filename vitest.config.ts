import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Event-store tests reopen real SQLite files; durability is never mocked.
    testTimeout: 30_000,
    // Release-track temp hygiene: the suites write real SQLite files into real temp
    // directories (294 call sites), most of which never get removed. One sweep for the
    // whole run removes what the run created; see test/global_setup.ts.
    globalSetup: ["test/global_setup.ts"],
  },
});
