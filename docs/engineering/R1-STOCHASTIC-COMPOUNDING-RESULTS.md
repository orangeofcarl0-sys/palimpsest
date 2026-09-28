# R1 — STOCHASTIC WORKER COMPOUNDING: RESULTS

> Stage: **R1**, branch `r1-stochastic-compounding`, base `main @ 044330b` (the E0→R0 landing).
> Protocol: `docs/engineering/R1-STOCHASTIC-COMPOUNDING-PROTOCOL.md`, digest
> `2d1dfecaf7feecc55601a00f0760cec7e95b667f2972ad34bb831740b006feca`.
> Evidence: `research-evidence/r1/`.

This document separates what was **mechanically measured** from what is **observed**, **analysed**,
**interpreted** and **not established**, per the ruling's §35.

---

## [MACHINE] — mechanically validated facts

**M1. The baseline is the landed mainline.** `origin/main` = `044330b2e55198542d545edc42ed9c36e7ce896b`
(`Merge pull request #215`); the R1 branch was created FROM it, so every reviewed E0→R0 commit remains
an ancestor. Post-merge CI on that exact commit: `ci` and `r0-gates` both success.

**M2. A real stochastic worker exists and was exercised.** Host DSH `0.1.7-rc.2`, provider
`deepseek-official`, model `deepseek-flash`, through the shipped `dshSubprocessWorkWorkerPort`. The
worker's own recorded environment line in every probe run:
`{"presentation":"ptc","deniedTools":[],"offeredTools":["run_code"]}`.

**M3. Durable capital was created through the ordinary owners.** In the probe: one published Proof
claim, one admitted Reasoning claim, one published Procedure (`prc-38bf2353…@0`) grounded in a real
recorded `OrganizationEvaluation`, all three project-associated. The procedure association had to carry
the exact admitted revision digest and the association id `<procedureId>@<revision>` — the product
refused a weaker association, correctly.

**M4. The selection resolved.** With C1/C2 the compile succeeded and the manifest carried the selected
bindings; the delivery payload's `compiled.handles` contained exactly
`@ctx/proof/…`, `@ctx/reasoning/…` and (C2 only) `@ctx/procedure/prc-38bf2353…/0`.

**M5. THE PRIMARY FINDING — the three conditions are indistinguishable to the worker.** The
model-visible prompt was reconstructed by the host's own `workTask()` rule and hashed:

| condition | handles in payload | handles rendered into prompt | boot rendered | method clause bytes in prompt | model-visible prompt digest (base-masked) |
|---|---|---|---|---|---|
| C0 | 0 | 0 | 0 | 0 | `d868e4c19e2529e31ec4c7a5fe76b71b…` |
| C1 | 2 | 0 | 0 | 0 | `d868e4c19e2529e31ec4c7a5fe76b71b…` |
| C2 | 3 | 0 | 0 | 0 | `d868e4c19e2529e31ec4c7a5fe76b71b…` |

**Distinct model-visible prompts across all three conditions: 1.**

The table reports the **base-masked** digest deliberately. The literal prompt contains
`Base commit: <H0 sha>`, and that sha is the hash of the fixture commit the run just created — a
per-run fixture value, not a condition variable. Comparing literal digests across runs of the same
condition would therefore differ for a reason that has nothing to do with the experiment; R1's first
comparison made exactly that mistake and was corrected by re-running all three conditions together
with the base masked. Both digests are recorded in `research-evidence/r1/rendered-prompt-*.json`.

**M6. The capital is absent from every channel the worker has.** Four independent checks:
1. `compiled.handles` entries carry `kind`, `handle`, `ref` — no `body` field.
2. `compiled.boot` contains only `source` entries; no proof/reasoning/procedure bytes.
3. The worker's execution world contains only `.git`, `package.json`, `src`, `test` — no capital file.
4. Grepping the worlds and the decompressed DSH session artifact for the method's clause text finds
   nothing.

**M7. The worker cannot pull.** The only worker-visible tool in every run was `run_code`; every
`palimpsest_*` tool is denied to a worker by the host's own capability rule, and `fetchContext` is a
controller API with no tool surface.

**M8. The workers nonetheless produced correct code.** All three probe runs reached job phase
`FINISHED` with `hostError=null`, all three workers reported `READY_FOR_SETTLEMENT`, and the committed
`src/dag.ts` passed the 8-case acceptance oracle **8/8** in every condition — including C0, which
received no capital at all.

**M8a. One run reported `HOST_FAILURE` at the worker level and is recorded rather than dropped.** An
earlier C2 run reached job phase `FINISHED` and committed passing code, yet its worker's own line read
`{"kind":"HOST_FAILURE","detail":"the worker finished without reporting an outcome"}` — the model did
the work but did not call the result tool. §16 requires this to be recorded rather than silently
retried: a worker is not clean merely because code landed. It also exposed a reporting defect in R1's
own probe, which printed only the JOB phase and so made a non-reporting worker look clean. The probe now
prints the worker outcome separately from the job phase, and the three runs reported in M5/M8 are all
`READY_FOR_SETTLEMENT`.

**M9. The relevance-pressure experiment ran** (no model involved): N=5/25/100, relevant set fixed at 3.

| N | associated assets | refs inspected | bodies fetched | operations | wall ms | mistaken inclusion | relevant missed |
|---|---|---|---|---|---|---|---|
| 5 | 5 | 5 | 5 | 9 | 4 | 2 | NONE |
| 25 | 25 | 25 | 25 | 29 | 12 | 22 | NONE |
| 100 | 100 | 100 | 100 | 104 | 39 | 97 | NONE |

**M10. Regression suite on the R1 branch.** build 0 errors; **2941 unit tests / 249 files, 0 errors**
(the R1 branch adds 18 harness tests to the 2923 it inherited); 38 e2e; `architecture:check` PASS
(0 violations); `architecture:check-public-api` PASS (0/0/0); `gate:e1-k` 14, `e2-i` 14, `e3-c` 21,
`e4-l` 10, `e5-p` 11, `e-live` 28, `d2` 15, `d4` 21, `d5` 10 — all PASS; consumer smoke PASS on
re-run (first attempt hit a transient network timeout fetching the pinned `@ordarium/*` tarballs, the
same documented flake R0 recorded).

**M11. Deterministic harness tests.** `test/r1_harness.test.ts`, 18 tests, all passing. They pin the
protocol parser and digest, the block ordering, the trial plan, the known-failure classifiers (in both
directions) and the verdict rule's refusal to manufacture a PASS. No test asserts that a model
succeeds.

**M12. No product source changed.** `git diff --stat main..HEAD -- src/ tools/ architecture/` is empty.

---

## [OBSERVED] — trial observations

**No primary trials were run.** The trial manifest is empty by design
(`research-evidence/r1/trial-manifest.json`). Registering 30 trials whose conditions provably produce
byte-identical model inputs would yield 30 runs of the same experiment and a comparison that measures
nothing. **Zero trials** is the honest record; synthesizing trials would fabricate a result.

What WAS observed, from the three precondition probe runs (one per condition, disclosed as such in the
protocol §0 caveat):

- Every run reached `FINISHED` with no host error, in roughly 60–90 s each.
- Every run committed a working planner and passed the oracle 8/8.
- The workers' own summaries show genuine engineering reasoning — e.g. C0's worker independently
  derived "cyclic graphs are now refused with a CycleError carrying a canonical closed witness path
  (rotated to the smallest node, computed from sorted adjacency so equivalent/rotated inputs yield
  identical diagnostics)". It was given no capital and no method text, and it rediscovered the whole
  contract from the task statement plus the acceptance oracle.
- C1's worker and C2's worker produced equally correct but *differently shaped* implementations
  (11011 and 8206 bytes of `src/dag.ts` respectively), which is ordinary model variance.

---

## [ANALYSIS] — comparisons across conditions

**A1. The primary comparison is void, not negative.** C0 vs C1 vs C2 differ in the product's records
(`compiled.handles` holds 0/2/3 entries) but not in anything the worker can perceive. A difference in
outcome between them would be sampling noise; a *lack* of difference would prove nothing about
capital. This is why the verdict is BLOCKED rather than NO_REPLICATION.

**A2. Where the capital is lost — the exact seam.** `src/context/distribution.ts` puts knowledge
bindings into `ContextDistribution.handles` and never into `boot`. That is deliberate and correct per
the E1-K ruling §7.9/§9.1: the index is minimal (`kind · ref · handle`), the body stays pull-only, and
"the worker gets no second knowledge block". The reference host's `workTask()` in
`host/dsh/lib/runner.js` renders `work.*` field-by-field and renders **only** `compiled.continuation`
from `compiled`. So the pull index is delivered to the host process and then dropped: nothing renders
it, and the worker has no tool with which to pull it.

**A3. This is a gap between two specifications, not a contradiction inside either.** The E1-K ruling
states the worker "receives the boot index entry and PULLS the body" (§ the K-N04 narrative). The
boot/pull spec (`docs/engineering/16-boot-pull-spec.md`) lists "worker 协议中途取件（需 DSH manifest
后议）" — mid-protocol fetching by the worker — as an explicit **non-goal** ("to be discussed after the
DSH manifest"), and notes `fetchContext` is a controller API. Both statements are true of the product
as built: the *mechanism* (compile, bind, distribute, resolve) is delivered and gate-proven; the
*worker-side rendering and pull* is the part the boot/pull spec deferred.

**A4. Every existing gate agrees, because every knowledge gate uses an in-process worker.** E1-K and
E5-P drive workers whose `run` is a JS function in the gate process that calls
`controller.fetchContext(...)` directly. Those workers *can* pull, because they are not sandboxed
processes. So the E1-K and E5-P gates are true statements about the compile/bind/pull/resolve
mechanism, and they never exercised the seam where a real worker would need the index rendered or a
pull tool exposed. That is why this gap survived five stages of green gates.

**A5. Relevance pressure scales linearly and predictably.** Inspected refs and fetched bodies grow
exactly 1:1 with N (5→25→100 gives 5→25→100), operations grow with the same slope plus a constant 4
owner queries, and wall time grows 4→12→39 ms. Correctness never degraded: the relevant 3 were found
at every N, and no relevant asset was missed. Mistaken inclusion grows linearly because there is no
relevance ranking to exclude decoys — which is by design, since V1 selection is explicit.

---

## [INTERPRETATION] — what the evidence suggests

**I1. R1's primary question cannot be answered by the product as it stands — and that is the finding.**
The question "does durable Project capital improve a later stochastic worker's observable behaviour?"
presupposes that the worker can observe the capital. It cannot. The precondition is not met, so no
honest PASS/PARTIAL/NO_REPLICATION is available.

**I2. This is a real, embedder-visible gap rather than a harness limitation.** The gates that pass are
passing on a mechanism whose last mile is unrendered. An embedder launching the shipped
`dshSubprocessWorkWorkerPort` today gets exactly what R1's probe got: three handles in a payload nobody
reads. The E5-P capability — "what we learned to do becomes how future workers begin working" — is
therefore proven up to the point of *availability* and not to the point of *use by a real worker*.

This is a different axis from E-LIVE's consumption levels, and worth stating precisely so the two are
not conflated: E-LIVE's Level 1→3 scale describes **how** a worker consumes a body it has already
pulled (Level 1 = a keyword triggers a pre-written file; Level 3 = the implementation is derived by
interpreting the structured clauses). R1's gap is one step earlier — the **real** worker never gets to
the point where a consumption level applies, because the handle is delivered to the host process and
then dropped. The E1-K/E5-P/E-LIVE gates demonstrate Levels up to 3 for **in-process** workers that call
`fetchContext` directly; no gate has ever demonstrated Level 1 for a real subprocess worker, because
the index is not rendered to it and it has no tool to pull with.

**I3. The relevance-pressure result is a genuine, independent measurement.** It is the one part of
R1's mission that survives the blocker, and it says something useful: explicit selection is
*correctness-complete* but *cost-linear*. At N=100 an operator must enumerate and inspect 100 refs to
find 3, with 97 mistaken inclusions. That is friction, not a semantic failure.

**I4. The prescribed next step is a semantic stage, and R1 has identified its exact shape.** §28
permits an immediate semantic stage only for `SEMANTIC_BLOCKER`; the relevance result is
`SCALING_FRICTION`, which does **not** justify one. The primary blocker, however, is not about
relevance at all: it is the missing render-and-pull last mile. Fixing that requires a host-side change
(render the index into the task text, and/or expose a governed pull) — which is product semantics,
which §4 forbids R1 from implementing.

---

## [LIMITATION] — what is not established

**L1. Nothing about capital's effect on stochastic workers.** Not that it helps, not that it does not.
The experiment could not form its comparison. Any claim either way would be unsupported.

**L2. Scenario B was not built.** It was registered in the protocol but the primary matrix was blocked
at the precondition, so constructing a second fixture would have produced a second unmeasurable
scenario. Its contract remains frozen for a later stage.

**L3. The probe's three runs are not trials.** They are one run per condition, and they are reported as
precondition evidence, not as results. They are far too few to support any comparison even if the
conditions had differed.

**L4. The delivery gap was measured through the reference host only.** `host/dsh/lib/runner.js` is the
first-party host; another embedder could render the index themselves, since the handles *are* delivered
to the host process. So the precise claim is "the shipped host does not render or expose a pull", not
"the mechanism makes rendering impossible".

**L5. `deepseek-flash` is one model on one profile.** Even with the blocker removed, any result would be
scoped to this model/profile, per §36. The strongest permitted statement would remain the §36 sentence,
and R1 is not entitled to it here.

**L6. The relevance-pressure measurement is a host-cost model, not an operator study.** It counts owner
queries and reads a host would perform; it does not measure human effort.

**L7. R1 ran on Windows.** The D-gates' Linux behaviour remains unverified (private DSH host
unavailable), exactly as R0/R0-M recorded.

---

## [PRESSURE] — selection and reliability issues exposed

**P1. Capital delivery to a real worker: BLOCKER.** The index is delivered to the host and dropped;
the worker has no pull. This is the finding that stopped the primary matrix. Classified
`R1 SEMANTIC BLOCKER` per §4, with the evidence in [MACHINE] M5–M7.

**P2. Relevance selection: SCALING_FRICTION.** Cost grows linearly with the asset population while
correctness is preserved. Not a blocker (§28). Recorded with exact counts in M9.

**P3. Two harness bugs were caught by the new deterministic tests rather than by inspection** — worth
recording because both would have silently mis-scored trials had the matrix run:
1. The Scenario B known-failure detector counted `normalizeAliases` as a legacy validator, so it fired
   on a *correct* implementation (in the prescribed method, normalization follows validation).
2. It also matched the function's own name (`migrateConfig(`), making every implementation look like it
   migrated first. Both are now pure functions with known-answer tests in both directions.

**P4. One more Windows host constraint confirmed:** an unclosed SQLite store blocks `rmSync` on the
next round, so each population N must own a separate durable world. Not a product defect; recorded
because it silently corrupts a multi-round experiment.

**P5. §29's options remain hypotheses, as required.** Option **B** (deterministic relation-based
selection) would address the *mechanical* part of P2 — the host could follow declared relations instead
of enumerating every association — and would solve nothing in P1, because P1 is not a selection
problem. Option **C** (advisory semantic relevance) is not required by anything R1 measured. Neither is
implemented.

---

## Verdict

```
R1 STOCHASTIC WORKER COMPOUNDING: BLOCKED

primary matrix:    NOT RUN — R1 SEMANTIC BLOCKER (capital cannot reach a real worker)
secondary (N=5/25/100): RUN — SCALING_FRICTION
```

**BLOCKED is not one of the three verdicts §23 defines, and is deliberately not reported as one.** A
`NO_REPLICATION` would claim the product was tested and found wanting; a `PARTIAL` or `PASS` would
claim a comparison was formed. Neither happened. The product's *mechanism* for compile/bind/distribute/
resolve is intact and gate-proven; the *last mile* to a real worker is absent, and no stochastic-effect
claim can be made in either direction until it exists.
