# C6-R — Baseline and Readiness

**Stage:** C6-R — Agent-Native Behavioral Qualification & Comparative Value.
**Branch:** `palimpsest-c6r-behavioral-qualification`
**Incoming baseline:** `d1a05a7bfc145258efa34c2710998db04680d266` / tree
`e96cec6318bb35639e7083b222b811b8b2f59b11` (verified before any mutation)
**COG-6 Code Freeze:** `c10af086896abc139110eea041fdaccd19135590`
**COG-6 Evidence Freeze:** `967d176a7b504522ab785f0ba1a9d682bb4e068a`
**Protected `origin/main`:** `044330b2e55198542d545edc42ed9c36e7ce896b`, unchanged.
**Divergence:** 0 behind / 373 ahead at the start; the C6-R branch descends from `d1a05a7`.

---

## 1. Preflight

`research-evidence/c6r/preflight.txt` records the read-only commands. At capture:

| item | value |
| --- | --- |
| working tree | clean before the branch was created |
| branch | `palimpsest-cog6-agent-native-evolution` |
| HEAD / tree | `d1a05a7bfc145258efa34c2710998db04680d266` / `e96cec6318bb35639e7083b222b811b8b2f59b11` |
| `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b` |
| `origin/palimpsest-cog6-agent-native-evolution` | `d1a05a7bfc145258efa34c2710998db04680d266` |
| `origin/main...HEAD` | 0 / 373 |
| C6-R branch locally / remotely | absent before creation |
| worktree registrations | 95 |
| locks | 2 |
| gate roots under `%USERPROFILE%\.palimpsest-gates` | 19 |
| evidence trees | 74 (`cog6` included); C6-R adds `c6r` as the 75th |
| stashes | 0 |

Environment: Node `v24.14.1` (the package declares `>=24.15.0`; the warning is recorded), pnpm
`11.21.0`, Git `2.53.0.windows.2`, DSH `0.2.1-rc.3`. WSL2 Ubuntu has Node `v24.14.1`, npm `11.11.0`,
pnpm `11.21.0` and bubblewrap `0.11.1`.

The Node version is one patch below the declared engine. It was not changed on the host; the
runtime qualification ran on the same version and the build warning is preserved.

## 2. COG-6 documents audited

- `COG6-FINAL-REPORT.md`, `COG6-ENGINEERING-REPORT.md`, `COG6-PROJECT-OUTCOME-AND-AUTHORITY.md`;
- `COG6-EXPERIMENTAL-PROTOCOL.md`, `COG6-NATURAL-DISCOVERY-RESULTS.md`,
  `COG6-PROPOSAL-AND-AUTHORIZATION.md`, `COG6-EXECUTABLE-EVOLUTION.md`,
  `COG6-FRESH-CONTINUITY.md`, `COG6-COMPARATIVE-RESULTS.md`;
- `research-evidence/cog6/outcomes.json`, `runs/main/rubric.json`,
  `runs/main/candidates.json`, `runs/main/worktree.json`, `manifest.json`,
  `model/campaign.json`, `probe/probe-result.json`.

The audit found the provenance ambiguity described in
`C6R-COG6-EVIDENCE-PROVENANCE-ERRATUM.md`: the field
`mechanism.rubric.acceptedCapabilitiesDigest` is Candidate B, introduced only by the final negative
control, and was produced by the out-of-repo evidence extractor, not by the rubric. The rubric ran
before the control and evaluated A-era data; its own `siteBVendors: []` is only producible from A,
because B makes V4 compliant.

## 3. Commit chain

| checkpoint | commit / tree | content |
| --- | --- | --- |
| C6-R0 | `5f917d9` / `d414883f4c8b219a41ccf2367c61976c7afa2775` | preflight, provenance audit + erratum, provenance collector + tests, protocol amendment A1 |
| C6-R1/R2 | `1868898` / `ffda00e2cba8780a7446a0d4310234418696459e` | T1/T2 staging, isolated DSH runtime, provider-only egress, runtime qualification, budget evidence |
| C6-R3/R4 | `103c4eb` / `b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f` | neutral P1, fair F1, equivalence audit, run state, usage, budget, probe |
| verification addendum | `2411eef` / (evidence tree) | verification logs and run `c6r-001` |
| **Code Freeze (executable)** | **`103c4eb` / `b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f`** | all executable scripts, profiles and tests |
| Evidence Freeze | forward | probe evidence, reports, manifest |

No executable change was made after the Code Freeze. The verification and probe evidence are data;
the probe harness defect was recorded, not patched.

## 4. What C6-R changed, and what it did not

**No production Palimpsest code changed in C6-R.** The only production change in the inherited line is
COG-6's `src/composition/continuation.ts` revision fix, which remains active and is covered by
`test/lean_d5d_result_continuation_service.test.ts` test 15.

C6-R added:

- scenario staging (`scripts/c6r/staging.mjs`), provenance evaluation
  (`scripts/c6r/provenance.mjs`), session accounting (`scripts/c6r/session_stream.mjs`), run state
  (`scripts/c6r/runner.mjs`), budget (`scripts/c6r/budget.mjs`);
- the isolated-runtime harness: `qualify_wsl.sh`, `qualify_p1_wsl.sh`, `mock_llm.mjs`,
  `net_bridge.mjs`, `provider_proxy.mjs`, `egress_policy.mjs`, `probe_provider_wsl.sh`;
- neutral P1/F1 initializers (`seed_p1.mjs`, `build_f1.mjs`) and their evidence;
- five C6-R test files (40 tests).

No new authority root, approval database, intent admission authority, second promotion path, router,
scheduler, subscription system, result ledger, goal ontology, filesystem sandbox, LayerFS integration
or durable agent runtime was added.

## 5. Verification

At `103c4eb`, with logs in `research-evidence/c6r/verification/`:

| check | result |
| --- | --- |
| `pnpm run build` | **exit 0** (Node engine warning recorded) |
| `pnpm run architecture:check` | **PASS**, 0 violations, 9 accepted baseline exceptions |
| `pnpm run architecture:check-public-api` | **PASS**, 0 missing, 0 changed kind, 0 added |
| targeted batch | **8 files, 72 tests, 0 failed** |

The targeted set: the five `test/c6r_*.test.ts` files, `lean_d5d_result_continuation_service`,
`lean_d5c3_current_basis_reexecution` and `cog5_promotion_lineage`. The broad suite was not run; no
broad pass is claimed.

## 6. Readiness verdict

The deterministic experiment is ready: the scenario is time-staged, the P/F worlds are fact-matched
with zero confounders, the real Palimpsest host boots over P1, the runtime boundary is measured, and
usage/termination are implemented and tested. The provider is the only remaining precondition, and
the single probe did not reach it: the isolated runtime's DNS resolves the provider to the host
proxy's fake-IP `198.18.0.38`, TCP connects, and TLS resets before any HTTP response. R4–R7 are
therefore `BLOCKED`; no model cognition is claimed.
