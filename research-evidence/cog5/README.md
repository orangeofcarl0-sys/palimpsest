# COG-5 evidence

**Branch:** `palimpsest-cog5-trustworthy-continuation`
**Incoming baseline:** `924d30414ffd2a7b5f8f6aa297b8a29c9065c8aa` / tree `1b451532aa07da1f8035fe9f5855b6e62fd5781c`
**Code Freeze:** `af4cb65736d82419b151b3c4eccc75621ee1aea5` / tree `f854222a300f32bd24e0753398469ca86fd9545c`
**Evidence Freeze:** the commit adding this directory and the COG-5 reports; SHA reported forward.
**Model:** none. No provider call, no model session, no token spend.

---

## 1. What this evidence is

COG-5 tested whether the existing ProjectWorld, Work, Compatibility, Cross-Basis Admission and Result
Continuation capabilities can produce one lawful, executable continuation after project reality changes.

The **mechanism** is real and product-owned:

- the D2 work delegation (`prepare → isolated world → worker → completion → settle`);
- the completion contract and its observed evidence;
- `ATTEMPT_RESULT`, basis capture, promotion, quiescence and head reconciliation;
- the packaged `ResultContinuationService` and the D3 kernel it composes.

The **worker** is a deterministic test-owned `WorkWorkerRunPort`. It is **not** a model and **not** the DSH
subprocess worker. The host read fence was characterized from the shipped code but was not exercised by this
in-process worker.

The **positive compatibility** diagnostic uses a test-owned precise read set and test-owned empty facet
observations. It is labelled in every record; it is not a product observation and cannot grant reuse.

---

## 2. The runs

| directory | scenario | result |
| --- | --- | --- |
| `runs/main/` | lawful vendor-capability intake + promotion + governed rework + D2 execution + promotion; wrong-source, wrong-head, duplicate-promotion and unauthorized-live-head controls | **complete, 0 errors** |
| `runs/newsletter/` | unrelated newsletter change: packaged whole-repository overlap vs expert precise read set | **complete, 0 errors** |
| `runs/outofscope/` | worker writes outside the declared write scope | **settlement `NOT_READY` / `OUT_OF_SCOPE`; no completion, no promotion** |

Each directory contains the immutable `run.json` and `summary.json`. `runs/main/` additionally contains:

- `events.json` — the durable ProjectIR event log, read-only, with verbatim payloads;
- `worktree.json` — the test-owned repository heads, the candidate and committed-blob digests, the Git log and
  the final technical deliverable;
- `accepted-vendor-capabilities.csv` — the committed blob at the accepted intake head;
- `final-technical-fit.md` — the promoted deliverable at the final project head.

The test-owned worlds live outside the repository, under `.cog5-rig/`. The run records name the original
paths. The evidence copies are the immutable artifacts; the worlds themselves are disposable.

---

## 3. The key identities

| item | value |
| --- | --- |
| initial head | `29a08cd4be9273008892696da1f0dac2731aee46` |
| intake result commit | `9e9c89474bf4f8f7c3715b7a730e6b0be5761efd` |
| intake promotion | `promotion-1a5e8dcf9f43939bff73483f0294768f` (event 24) |
| accepted head | `365c830126744bf66fc1528b94a85ead500a7c09` |
| accepted vendor blob | `0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c` — equals the candidate |
| rework reopening | event 26, `TASK_READY` with `rework_provenance` |
| rework attempt | `attempt-8f395d58e1e39b5abb84829476ac2d3e` |
| rework result | `bb821f038a48de1bdd26e021993d578eb0be176e` at base `365c830` |
| rework promotion | `promotion-d7e2ebee47af2f6dac4e4d6e8efa5659` (event 38) |
| final project head | `42a8ab40ce33b24fa888413207efb95878b8bd5d` |
| final live head (control) | `07ca3558946d14a565afc9366b93caac34e5462b` |

The final live head is ahead of the project head **on purpose**: the last step is the unauthorized direct
commit control. It is not a broken final state.

The accepted vendor blob equals the candidate exactly. The checked-out working-tree file differs only by
Git's Windows line-ending normalization; the committed blob is the authoritative comparison.

---

## 4. The one production correction

`src/deployment/promotion_lineage.ts` selects the post-promotion change baseline. It uses the accepted
resulting head from `PROMOTION_COMMITTED` only after Git proves:

```text
resultCommit ⊆ resultingHeadCommit ⊆ currentSourceRevision
expectedHeadCommit ⊆ resultingHeadCommit
```

An unproven lineage becomes `UNAVAILABLE`, which the assessor reports as `UNKNOWN`. It never falls back to the
origin (which would restore the self-collision) and never fabricates a conflict or a compatibility.

The unit proof is `test/cog5_promotion_lineage.test.ts` (15 tests). The integration proof is the main run:
the promoted intake result is `UNKNOWN` after promotion instead of the pre-fix `INCOMPATIBLE` self-collision.

---

## 5. What is not claimed

- No model cognition, no model comparison, no efficiency or cost ratio.
- No positive packaged `COMPATIBLE` for a changed source world.
- No actual-read observation or source-scoped sandbox.
- No independent command verification for the documentation/data write scopes.
- No fresh-session model trial in COG-5; COG-4's P Session remains the fresh-session evidence.
- No broad test pass; the fixed 19-file / 259-test targeted run is the authoritative mechanism verification.

The full reasoning is in:

- `docs/engineering/COG5-READ-DEPENDENCY-RULING.md`
- `docs/engineering/COG5-SOURCE-INTAKE-RULING.md`
- `docs/engineering/COG5-OBSERVATION-RESULTS.md`
- `docs/engineering/COG5-SOURCE-INTAKE-RESULTS.md`
- `docs/engineering/COG5-CONTINUATION-RESULTS.md`
- `docs/engineering/COG5-ENGINEERING-REPORT.md`
- `docs/engineering/COG5-FINAL-REPORT.md`
