import { defineConfig } from "vitest/config";

/**
 * CI-LINUX-BASELINE (2026-11-03): these suites exercise the WINDOWS mandatory-integrity ACL seam,
 * NTFS junction/reparse behaviour, or replay a recorded Windows/experiment environment. They remain
 * in the repository and are runnable on the platform they were written for (and the Win32 seam is
 * covered by the Windows `host-boundary` job); running them on the Ubuntu `unit` job tests the
 * absence of the Windows API, not the product. Do not add a product-path suite here: the APS,
 * PC1, PC1-V1, Work/Scheduler, application, architecture and host-conformance suites stay included.
 */
const NON_LINUX_ENVIRONMENT_SUITES = [
  "test/gate_root_storage_discipline.test.ts",
  "test/host_s1_descendant_admission.test.ts",
  "test/host_s1_spine_coverage.test.ts",
  "test/host_s1r_capacity_domain.test.ts",
  "test/host_s1r_reparse_boundary.test.ts",
  "test/ci1_dependency_staleness.test.ts",
  "test/lean_work_execution_world.test.ts",
  "test/r3l0a_adjudication.test.ts",
  "test/r3l0b_canary.test.ts",
  "test/r3l0b_containment.test.ts",
  "test/r3l0b_immutability.test.ts",
  "test/r3l0c_containment.test.ts",
  "test/r3l0cf_gates.test.ts",
  "test/r3l0ci_gates.test.ts",
  "test/r3l0cia_gates.test.ts",
  "test/r3l0cia_qualification.test.ts",
  "test/r3l0ciar_gates.test.ts",
  "test/r3l0ciar_qualification.test.ts",
  "test/r3l0ciarl_gates.test.ts",
  "test/r3l0ciarlc_gates.test.ts",
  "test/r3l0ciarlcf_controls.test.ts",
  "test/r3l0ciarlcf_gates.test.ts",
  "test/r3l0ciarlcfs_gates.test.ts",
  "test/r3l0ciarlcfsh_persisted.test.ts",
  "test/r3l0cr_contract.test.ts",
  "test/r3spec_contract.test.ts",
  "test/r3wr2_lifetime_recovery.test.ts",
  "test/r3wr3_world_identity.test.ts",
  "test/r3wr_object_store.test.ts",
  "test/trajectory_p2b_source_contract.test.ts",
  "test/trajectory_p2d2_host_delivery.test.ts",
  "test/trajectory_p2e1re_win32_fault.test.ts",
  "test/trajectory_p2e1rf_delegation_alias.test.ts",
];

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      ...(process.platform === "win32" ? [] : NON_LINUX_ENVIRONMENT_SUITES),
    ],
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
