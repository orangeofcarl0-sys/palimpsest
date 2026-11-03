# PC1 — PR review kit (no PR was created)

## 1. Identity

| Fact | Value |
|---|---|
| Target `main` (protected) | `044330b2e55198542d545edc42ed9c36e7ce896b` (unchanged) |
| Base / source branch | `palimpsest-c6r-behavioral-qualification` @ `044b08056a0e98b7d7cee207cb36fb7e453907fe` |
| Base tree | `1b7caa156d187e952be8bd90e797f440cb7e2402` |
| Proposed branch | `palimpsest-product-convergence-v1` |
| Code freeze | `e8c7675205c74d33015966f3c5b62eec6e2279f1` / tree `e20d4c7682ac33aed9f2ae3e1bb5e2d185d7fcf8` |
| Delivery/evaluation freeze | `bd34f96d7e22beebce44b773dcad2920e97752bb` / tree `409583a6f74f446184ad03314e4de36e59684143` |

The exact evidence-freeze head is recorded in `docs/programs/pc1/S10-FINAL-REPORT.md` after the
final manifest. No force-push, rebase, branch deletion, worktree removal, or main movement was done.

## 2. Complete changed-file inventory

Use local Git, not a truncated hosted compare:

```bash
git diff --name-status 044b08056a0e98b7d7cee207cb36fb7e453907fe..HEAD
git diff --stat      044b08056a0e98b7d7cee207cb36fb7e453907fe..HEAD
```

The change groups are:

| Group | Files |
|---|---|
| Result/report integrity | `src/tools/controller.ts`, `src/work/report_integrity.ts`, `src/work/attempt_observation.ts`, `src/deployment/execution_world.ts`, `src/tools/work_evidence.ts` |
| Normal product path | `src/product.ts`, `src/adapters/dsh/normal.ts`, `src/adapters/dsh/tool_profile.ts`, `src/composition/application.ts`, `src/adapters/dsh/index.ts` |
| Continuity/outcomes | `src/project_continuity/**`, `src/composition/continuity.ts`, `src/application/workspace_extra.ts`, `src/adapters/dsh/continuity.ts`, `src/domain_outcome/**`, `src/adapters/dsh/outcome.ts` |
| Review/authority | `src/project_review/**`, `src/cli_product.ts`, `src/cli.ts` |
| Collaboration contracts | `src/project_handoff/**` |
| Runtime/doctor | `src/runtime/doctor.ts`, `src/runtime/usage.ts`, `src/runtime/process.ts`, `src/runtime/index.ts` |
| Scenarios/runners | `scripts/pc1/**` |
| Tests | `test/pc1_*.test.ts`, `test/gate_tool.test.ts`, `test/acceptance.test.ts` |
| Architecture | `tools/architecture/application_parity.ts`, `tools/architecture/layers.ts`, `architecture/public-api-baseline.json` |
| Docs/pack | `docs/programs/pc1/**`, `README.md`, `examples/pc1/**`, `.gitignore` |

## 3. Public API / schema / dependency / permission changes

### Public API (additive)

- `palimpsest-dsh/product` subpath: `installProduct`, `InstallProductOptions`, `InstalledProduct`.
- `palimpsest-dsh/advanced` re-exports: `runDoctor`, `dedupeUsage`, `sumUsage`, `classifyRun`,
  `canStartSession`, `terminateProcessTree` (and their types).
- New DSH tools (normal tier): `palimpsest_work`, `palimpsest_continuity`, `palimpsest_outcome`.
- `InstallPalimpsestOptions` extension in `src/install.ts`: `toolProfile`.
- `ProjectWorkspaceApplicationSurface` adds summary/explain/contextCapsule/outcome methods.
- `SettlingExecutionWorldPort` adds `exportResultCommitSync`.

`architecture/public-api-baseline.json` was regenerated with `--write-public-api`; the additions are
visible in the diff, not hidden.

### Schema

- No canonical event/schema/task/ProjectIR change.
- New NON-CANONICAL SQLite store: `review.sqlite` (proposal/review metadata).
- New journal marker `pc1-domain-outcome/v1` for domain evaluations.
- New `pc1-proposal/v1`, `pc1-handoff/v1`, `pc1-receipt/v1` documents (non-canonical).

### Dependencies

- No new runtime dependency. `package.json` version is `0.2.0-pc1.1`; scripts for PC1 staging and
  acceptance were added. The locked Ordarium/DSH dependencies are unchanged.

### Permissions

- No new authority root.
- `write_scope_valid` / `expected_files_exist` are now produced by the product, not by a caller's
  command. This NARROWS what a model can claim.
- `palimpsest_outcome` cannot set a status or register a contract.
- Review decisions require a host-supplied operator authority; a model cannot decide or apply.
- The local CLI operator is a local identity assertion, not a remote IdP.

## 4. Migration and rollback

- No canonical migration is required; all new stores are additive and empty on first use.
- Existing review/proposal files are metadata; they do not need to be replayed into ProjectIR.
- Old evidence atoms are not requalified. A gate that passed on older structural atoms remains
  historical; new qualification uses the new producer.
- Rollback: point the launcher at the previous RC and keep the same state directory. Remove
  `review.sqlite` only if the operator wants to discard proposal metadata; no canonical owner reads
  it.
- A recovery of an uncertain promotion still requires the result object to be readable and
  `reconcileAll` to prove the effect; no blind retry.

## 5. Required CI / evidence

| Check | Result | Evidence |
|---|---|---|
| Build | PASS | `research-evidence/pc1/s10/final-build.log` |
| Architecture | PASS 0 violations / 9 accepted exceptions | `final-architecture.log` |
| Public API | PASS after the recorded additive baseline update | `final-public-api.log` |
| Curated final integration | 134/134 PASS | `final-integration.log` |
| Full ordinary suite | NOT CLEANLY OBSERVED on this Windows host (86 hook-timeout/lock failures under contention); one test reproduced identically at the baseline | `final-full-test-clean.log` |
| Scenario acceptance | PASS; live cohort separately observed (8 sessions, 0 provider errors) | `research-evidence/pc1/s08/acceptance.json`; `research-evidence/pc1/live/outcomes.json` |
| RC | tarball + SHA-256 + manifest | `dist-rc/palimpsest-0.2.0-pc1.1.tar.gz` |

The pre-existing failure was reproduced on a temporary baseline worktree at `044b080` with the
baseline `dist`; it is an environment/first-party-DSH limitation, not a PC1 regression. The test's
own output records `level1: NOT_ESTABLISHED` and no fabricated settlement.

## 6. Risk areas for review

1. **Report path export** — new object-only fetch before the ledger append. Check that the
   canonical repository's alternates/path view is the intended one for every deployment.
2. **Structural gate semantics** — a caller command is ignored for structural predicates. This is a
   deliberate narrowing; any external script that relied on the old behavior must pass an actual
   tree observation.
3. **Review store** — non-canonical metadata; verify no canonical reader depends on it.
4. **Tool tiers** — `installPalimpsest` default is still `expert`; only `installProduct` defaults to
   `normal`. A host that wants the normal surface must use the product entry or set `toolProfile`.
5. **Local operator** — not a substitute for a real identity provider; a deployment that needs
   stronger separation must supply one.
6. **Live evaluation** — the eight scored sessions are real, but they are single-principal; do not
   treat the deterministic acceptance as a substitute for them, and do not infer independent-agent
   synthesis from the field-study role files.

## 7. Owner decisions

- Whether to open a PR / integrate this branch.
- Whether to authorize a new spend window for the matched P/F pilot.
- Whether to replace the local CLI operator assertion with a real identity provider.
- Whether to compose a per-condition DSH profile generator for the field-study live condition.
