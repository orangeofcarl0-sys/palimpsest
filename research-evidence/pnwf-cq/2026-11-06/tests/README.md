# PNWF-CQ test records

Commands were run on the PNWF-CQ working tree with Node 24.14.1 and pnpm 11.21.0 on Windows.

| command | result |
|---|---|
| `pnpm build` (`tsc -b`) | PASS |
| `pnpm architecture:check` | PASS — 0 violations, 9 accepted baseline exceptions |
| `pnpm architecture:check-public-api` | PASS — 0 missing, 0 changed kind, 0 added |
| `npx vitest run test/pnwf_cq_action_coherence.test.ts` | 9/9 PASS |
| `npx vitest run test/pnwf_cq_direct_governed.test.ts` | 1/1 PASS |
| `npx vitest run test/pnwf_cq_basis_admission.test.ts` | 3/3 PASS (success, dirty/non-ancestor/graph-change negatives, signed-operator CLI) |
| `npx vitest run` (20 related files) | 133/133 PASS |
| `npx vitest run` (15 related files) | 115/116 initially; the failure was the custom Git port world root, fixed in `src/deployment/execution_world.ts`; `test/lean_work_execution_world.test.ts` then 7/7 PASS |
| full `npx vitest run --reporter=dot` | 46 files failed / 412 passed; 109 tests failed / 5,625 passed (5,734) in 1,484 s |
| final `npx vitest run --fileParallelism=false` (acceptance set) | 7 files / 50 tests PASS |

The later 2026-11-07 container cohort is **not** a test pass: it is invalid and over budget; see
[`../../live/2026-11-07/README.md`](../../live/2026-11-07/README.md).
| `bash scripts/pnwf/run_direct_governed_host.sh` | PASS — P0/P1/P2 exit 0; `HEAD_BASIS_MISMATCH`; 0 attempts; 0 promotions; canonical head unchanged |
| `node scripts/pnwf/isolation_gate.mjs` | `EVALUATION_ISOLATION_QUALIFIED` — 16/16 checks |
| `node scripts/pnwf/run_pnwf_live.mjs --execute` without isolation record | BLOCKED, exit 4, modelCalls 0 |
| same with a `principalRuntime: "host"` record | BLOCKED, exit 4, modelCalls 0 |

## Full suite

`full-suite.log` is the complete `npx vitest run --reporter=dot` output. The 109 failures are
attributed to:

- 30 s timeouts under the full parallel load (PNWF, PWRS, PC1-V1, LHAPE, CI3, host boundary, in-place);
  the same files pass sequentially (`acceptance.log`, 47/47).
- dirty-tree historical guards (`ad_verification_integration` asserts `git diff HEAD` is empty under
  protected paths; R3 evidence guards assert protected evidence digests). They are expected to fail on
  an uncommitted stage tree; they are not weakened here. After the implementation commit,
  `ad_verification_integration` passes 32/32. The R3 evidence guard still fails with EACCES on the
  pre-existing protected junction
  `research-evidence/pc1v1/live/.../home/profiles/node_modules/@deepseek-ai` — an environment/link
  boundary, not a PNWF-CQ source change.
- a missing `python` executable in the local environment (`inplace_execution`).
- DSH-version drift and the known Windows cleanup/link boundary.
- one CQ-D TOCTOU test that loaded the pre-build dist because the full suite started before the final
  controller change. The final sequential run after the build passes it.

No test assertion was changed to hide a product failure. The PNWF-CQ acceptance set is the six-file
sequential run above.

## Notes

- The full suite was started before the final TOCTOU test was added; the CQ test file was rerun
  separately after the final build (`9/9`). No other test file changed after the full-suite start.
- Every test uses a real temporary Git repository and the real product; no model is involved.
- The real host scenario uses the qualified `@deepseek-ai/dsh@0.2.1-rc.5` with a labelled
  deterministic Messages stand-in.
