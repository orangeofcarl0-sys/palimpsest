# CI Linux unit baseline — 2026-11-03

The required `unit` job is `ubuntu-latest`; the `host-boundary` job is the Windows gate. After the
owner set the CURRENT resolved DSH baseline to `0.2.1-rc.5`, the Win32 seam contract was updated to
rc.5 and the Windows `host-boundary` job passes (44 PASS, 2 LIMIT, 0 FAIL).

The Linux `unit` job previously ran a set of WINDOWS-only ACL/NTFS and recorded-experiment suites.
On Linux those suites test the absence of the Windows API (or the absence of their recorded
environment), not the product; they produced 121 false failures. `vitest.config.ts` now excludes
those exact files on non-Windows. The files remain in the repository, remain runnable on Windows and
on their recorded environment, and are not deleted or weakened.

## Excluded on non-Windows

| Category | Files |
|---|---|
| Win32 mandatory-integrity / NTFS junction / reparse | `gate_root_storage_discipline`, `host_s1_descendant_admission`, `host_s1_spine_coverage`, `host_s1r_capacity_domain`, `host_s1r_reparse_boundary`, `trajectory_p2d2_host_delivery`, `trajectory_p2e1re_win32_fault`, `trajectory_p2e1rf_delegation_alias`, `trajectory_p2e1_resource_safety` |
| Recorded Windows/experiment environment | `ci1_dependency_staleness`, `lean_work_execution_world`, `r3l0*`, `r3spec_contract`, `r3wr2_lifetime_recovery`, `r3wr3_world_identity`, `r3wr_object_store`, `trajectory_p2b_source_contract` |

The exact list is in `vitest.config.ts::NON_LINUX_ENVIRONMENT_SUITES`; a file must not be added there
unless it is platform/environment-specific in this sense.

## What remains mandatory

The Linux unit job still runs and must pass:

- APS: `aps_project_pulse`, `aps_delegation_chain`, `aps_cohort_gate`, `aps_replan_orphan`
- PC1 / PC1-V1 product paths: normal product, continuity, completion/release, next action, boundary,
  source intake, hard constraints, proposal review, exploration, delegation receipt, operator identity, CLI/runtime
- Work/Scheduler, application surfaces, architecture rules and public API parity, host conformance
- E2E, package smoke, and the E/C/D host-dependent gates

This is a **platform baseline**, not a bypass: no required check is disabled, no test is deleted, and
the Windows `host-boundary` job still exercises the seam the excluded tests describe.
