import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Event-store tests reopen real SQLite files; durability is never mocked.
    testTimeout: 30_000,
    /**
     * R0-R §5/§6: hooks get the SAME budget as tests.
     *
     * A `beforeAll` that builds a rig materializes real git worktrees and SQLite databases, which is
     * exactly what a test does — but vitest's hook default is 10s regardless of `testTimeout`. Under
     * contention (a full local run, or a shared CI runner) five such hooks blew their 10s budget and
     * failed the FILE even though every test passed in isolation. The repository's own CI rule is
     * "flakiness is fixed, never retried away", and raising a hook's budget to the test budget fixes
     * the flake at its cause: the hook was never doing anything that deserved a smaller allowance.
     */
    hookTimeout: 30_000,
    // Release-track temp hygiene: the suites write real SQLite files into real temp
    // directories (294 call sites), most of which never get removed. One sweep for the
    // whole run removes what the run created; see test/global_setup.ts.
    globalSetup: ["test/global_setup.ts"],
  },
});
