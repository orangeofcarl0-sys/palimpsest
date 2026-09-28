# E-LIVE — Long-Horizon Intellectual Compounding Dogfood

**Status:** E-LIVE complete
**Baseline:** `ad8f3e6ebc0566856764dc66f5fb3fa1fd138ec3` (`feat(e5-p): capitalize project experience into reusable procedures`)
**Machine gate:** `pnpm gate:e-live` (deterministic; PASS)
**Project under dogfood:** `DAG Planner`, a real TypeScript library with an independent acceptance suite

This document distinguishes four kinds of statement, and never mixes them:

| marker | meaning |
|---|---|
| **[MACHINE]** | proven by `gate:e-live`, re-runnable, deterministic |
| **[OBSERVED]** | recorded during the dogfood run; true of this scenario, not generalized |
| **[INTERPRETATION]** | my reading of the evidence; explicitly not a machine-proven fact |
| **[FRICTION]** | something the host had to do, or could not do, that a reader should weigh |

---

## 1. The question

> Does a later worker begin from a genuinely higher cognitive floor because earlier project work
> became durable project capital?

The stage does **not** ask whether every API was invoked once, and it does **not** ask whether the
existing gates still pass. Both are necessary and both are insufficient. The target is that a
previously-paid cognitive cost is **not paid again** by a later generation, and that the evidence for
that is **behavioral** rather than "a handle existed".

## 2. The dogfood project

`DAG Planner` is an ordinary library: given a directed dependency graph, produce a deterministic
execution plan that respects every dependency.

- `scripts/gates/dag-planner/src/dag.ts` — the project's source (H0 is a declared contract with no implementation).
- `scripts/gates/dag-planner/test/acceptance.test.ts` — **the independent acceptance contract**.

The acceptance suite knows nothing about Palimpsest. It covers acyclic ordering, determinism,
disconnected graphs, stable tie-breaking, and four cycle behaviours. It is **fixed for the whole
dogfood**, so the same contract judges Generation 0's naive implementation and every later
generation's. **[MACHINE]** the contract never moves to meet the implementation: it is copied
byte-identically into every generation's repository and into the paired control.

The initial requirement is deliberately stated universally:

> The planner must return a valid dependency-preserving order for **every** input graph.

A cyclic graph makes that impossible. The conclusion is **not** written into any worker prompt: it is
discovered by running the project's own tests. **[MACHINE]** `G0.6` records that the contradiction
surfaced as real test failures — 3 of Generation 0's 4 failing tests are the cycle family — not as a
harness assertion.

Two different baselines are measured in this document, and they are not interchangeable:

- **H0** (`dag-planner/src/dag.ts`, the committed fixture) is a declared contract whose
  `planExecution` throws `not implemented yet`. It fails **0 pass / 8 fail**. It is the *starting
  point* of every generation and of the paired control, never a generation's result.
- **Generation 0's deliverable** (`scripts/gates/naive-dag.ts`, written by the worker) implements the
  universal requirement literally with a Kahn-style sort and no cycle handling. It fails
  **4 pass / 4 fail** — the acyclic, determinism, disconnected and tie-breaking tests pass; the four
  cycle-behaviour tests do not.

Only the second is an *implementation*, and only the second is the "old discovery" that Generation 1
inherits a way to avoid repeating. `naive-dag.ts` is a standalone prototype kept for exactly this
reason: it is Generation 0's and the control's committed output, and it is never the fixture.

## 3. Compounding ledger

| | Generation 0 | Generation 1 | Generation 2 |
|---|---|---|---|
| **Project revision** | rev 1 → 2 (intent reconciled) | rev 2 → 3 | rev 3 → 4 |
| **Inherited knowledge** | none | 1 Proof claim + 1 Reasoning claim | 1 Proof claim + 1 Reasoning claim + G1 finding |
| **Inherited procedure** | none | **P@1** (ACTIVE) | **P@2** (ACTIVE, P@1 SUPERSEDED) |
| **External contribution available** | none | accepted cycle-diagnostic contract (adopted in G0) | same, still adopted |
| **New discovery performed** | **yes** — the cycle contradiction | **no** — inherited | **no** — inherited (extended instead) |
| **Old discovery repeated?** | n/a | **no** | **no** |
| **Procedure revision** | — | P@1 bound ACTIVE-at-compile | P@2 bound ACTIVE-at-compile |
| **Human/host assistance** | 0 | 1 (asset-id discovery — see §7) | 1 (same) |
| **Acceptance suite outcome** (the generation's promoted deliverable) | 4 pass / 4 fail | **8 pass / 0 fail** | **8 pass / 0 fail** |

No single numeric score is produced, deliberately: §31 forbids collapsing this into "an intelligence
score", and the quantities above are not commensurable.

## 4. The textbook effect

This is the stage's central claim, and it is measured behaviourally.

**[MACHINE]** Each generation's worker records an observable `rediscovery_check`:

| condition | inherited method present? | `rediscovery_check` | acceptance suite |
|---|---|---|---|
| **Generation 0** | no | `PERFORMED` | 4 pass / 4 fail |
| **Generation 1** | **yes (P@1)** | **`NOT_PERFORMED`** | **8 pass / 0 fail** |
| **Paired control** (same task, capital withheld) | no | `PERFORMED` | 4 pass / 4 fail |
| **Generation 2** | **yes (P@2)** | **`NOT_PERFORMED`** | **8 pass / 0 fail** |

The mechanism, stated precisely so it can be checked: the worker's implementation is **derived by
interpreting the inherited procedure's structured content**, never selected by the harness. A closed
clause vocabulary classifies each ordered step (`NORMALIZE_AND_VALIDATE`, `DETECT_CYCLE_FIRST`,
`REFUSE_WITH_NORMALIZED_WITNESS`, `ORDER_ACYCLIC`, `TIE_BREAK_AFTER_NORMALIZATION`, `VERIFY_EVERY_EDGE`,
`CLOSE_WITNESS_LOOP`, …) and the emitted source is assembled from the fragments those clauses select,
**in the order the method states them**. A worker with no inherited method writes the naive prototype
and must discover the problem itself.

**[MACHINE] `C.22` is the evidence that the content is genuinely INTERPRETED rather than
keyword-matched.** Six mutated methods were derived and run against the *unchanged* acceptance
contract; each behaved exactly as its content predicts:

| mutated content | clauses | outcome |
|---|---|---|
| baseline (the real P@1) | normalize, cycle-first, verify | **CONFORMANT** (8/0) |
| no cycle step at all | no cycle handling | **VIOLATES** (5/3) |
| the same clauses in the WRONG ORDER (order before detect) | `cycleBeforeOrder=false` | **VIOLATES** (5/3) |
| no normalize/validate step | no validation | **VIOLATES** (5/3) |
| no explicit tie-break clause | `tieBreak=false` | CONFORMANT (8/0) — `normalize` already orders the node set, so the clause is redundant |
| no verify step | `verifies=false` | CONFORMANT (8/0) — the order is already correct; the guard is not observable |

A Level-1 consumer (handle exists → write a pre-written file) *cannot* fail this probe: the file would
be identical for every row. The three VIOLATES rows are consequences of the method's *content*, which
is what makes this consumption Level 3 rather than Level 1. The two conformant-by-redundancy rows are
recorded as they are rather than tuned: they are real properties of this method, and the interpreter
still emits the clause when a method states it.

**What this interpreter is — and is not.** It is a **domain-specific structured interpreter** for this
one project's method vocabulary: it knows about dependency graphs, cycle witnesses and topological
order because `DAG Planner` is the dogfood's project. It is deliberately **not** a generic Procedure
execution engine and **not** a universal procedural compiler. `ProcedureContent` remains declarative
by construction (E5-P forbids a procedure from carrying shell commands, arbitrary code or implicit
authority) and this module does not change that — it emits a TypeScript source file from a closed
clause vocabulary, inside a harness, for one domain. A different domain would need a different
vocabulary and different fragments; nothing here generalizes by configuration. It lives under
`scripts/gates/`, nothing in `src/` imports it, and the `Procedure` owner neither knows nor cares that
it exists.

**[MACHINE]** `C.21`: Generation 2's extension is also content-driven. The revision adds the step
*"close the witness loop by repeating its first node"*, and the derived implementation closes the loop
because that clause is present — not because a harness flag asked for it. The same clause vocabulary
classifies both revisions; there is no harness switch to turn the extension on.

**[OBSERVED]** Generation 0 paid the discovery cost: it wrote the naive implementation, and the
project's own suite failed it (4/4). Generation 1 did not: it inherited P@1, received the handle
`@ctx/procedure/prc-…/0`, pulled the body, and its very first implementation satisfied the contract.

**[MACHINE]** the comparison is only meaningful if the two conditions began from the same input, so
`PC.4` proves it with digests rather than asserting it. Three independent witnesses of Generation 1's
**pre-task** `src/dag.ts` must agree: the digest the harness read from the canonical repository before
the attempt world existed, the digest the **Generation-1 worker itself recorded** from inside its
attempt world, and the digest the control repository was seeded with. They do — identical bytes — and
the acceptance contract is likewise identical between the fixture and the generation's copy. Both
conditions run the *same* worker factory (`dagWorker`), not a hand-copied lookalike. The single
difference is whether the inherited capital was selected, which `PC.1` records as `0 handles`.

**R0-R §3.1 sharpened this further, and the result is stronger than the earlier framing.** The control
is now seeded from Generation 1's *exact* pre-task bytes rather than from the H0 fixture, so the two
conditions differ in nothing but the inherited capital. Given identical input and no inherited method,
the control's worker **derives nothing at all**: the naive implementation it emits is byte-identical to
what is already in the repository, so it cannot even produce a candidate change (`PC.3a`: `UNCHANGED`).
The comparison is therefore not "the control did worse" but "without the inherited method there is no
change to make" — the sharpest available form of the paired measurement.

**[INTERPRETATION]** This is the textbook effect in the narrow, honest sense the stage allows: one
previously-paid cognitive cost was not paid again, in this scenario, with the difference observable
in the committed artifact. It is **not** a claim that any worker anywhere would behave this way, and
it is **not** a claim that the method is universally correct. The method's own admission note says
so: `contextual_reusable_project_procedure_not_universal_optimum`.

## 5. Asset lineage

The strongest evidence of compounding is one asset's full lineage, with durable refs.

**[MACHINE]** the lineage below is exactly what `gate:e-live` produced (ids vary per run; the shape
and the joins do not):

```
raw experience
  the project's own acceptance run at Generation 0's PROMOTED head: 4 pass / 4 fail
  (H0, the fixture it started from, is 0 pass / 8 fail — that is the starting point, not a result)
    → Proof source "g0-acceptance-run" (imported bytes)
    → evidence record
    → admitted Proof claim  pc-…  "a topological order preserving every edge cannot exist
                                   for a directed cycle"
    → associated with Project A as PROOF_CLAIM

intent effect
  → E2-I proposal pip-… grounded in {proof: [pc-…], negative_results: [pje-…]}
    → independent authority "elive-intent-authority" ADMIT
    → PROJECT_REVISED carrying the reconciliation receipt
    → requirement becomes "…for cyclic graphs refuse with an explicit cycle diagnostic"

Work consequence
  → the reconciled requirement introduces t2 (cycle diagnostic), declared BLOCKED
    → E3-C grounded need → commitment → Project B's own Work
    → accepted BoundaryRevision ws-cycle/art-contract@0
    → admitted fulfillment (FULFILLED, terminal)
    → explicit local adoption: REFERENCE_NOTE pje-… + OPPORTUNITY pje-…

empirical evaluation
  → structural intervention ivr-… (from the governed organization evolution case)
  → linked experiment exp-structural
  → OrganizationEvaluation eval-…

Procedure P@1
  → authored from grounds {ORGANIZATION_EVALUATION: eval-…, INTERVENTION_RECORD: ivr-…}
  → admitted by "elive-procedure-admission"  (an absent authority published NOTHING: P.2)
  → prc-…@0 ACTIVE, associated with Project A as PROCEDURE

later experience
  → Generation 1's empirical finding (tie-breaking before normalization) → Proof claim pc-…
  → OrganizationEvaluation eval-… (normalize-then-tiebreak)

Procedure P@2
  → candidate prepared with procedureId = prc-…, supersedes = prc-…@0
  → admitted → prc-…@1 ACTIVE, prc-…@0 SUPERSEDED

Generation-2 use
  → Generation 2's attempt bound @ctx/procedure/prc-…/1
  → extended the diagnostic (the witness now closes the loop), 8 pass / 0 fail
```

**[MACHINE]** `G2.4`/`G2.14`: after supersession, the Generation-1 attempt's manifest **still**
records `standing_at_compile = ACTIVE` while a pull reports `current = SUPERSEDED`. No historical
manifest is rewritten. `G2.16`: a **fresh** attempt is refused P@1 with
`KNOWLEDGE_PROCEDURE_NOT_ACTIVE`; `G2.17`: the same fresh attempt binds P@2.

## 6. Cross-loop composition

§20 asks the loops to COMPOSE rather than run as sequential demos. **[MACHINE]** four chains, each
with a real consequence for the next:

1. **Work failure → durable knowledge → intent revision → later Work.**
   Generation 0's failing suite produced the Proof claim and the `NEGATIVE_RESULT`; the E2-I proposal
   was grounded in exactly those two (`I.1`, `I.5`); the revision changed the requirement that
   Generation 1's Work then ran under (`R1.6`).
2. **Project dependency → sovereign collaboration → fulfillment → local adoption → later Work.**
   The reconciled requirement created a BLOCKED task (`C.1`), which grounded a need (`C.2`), which
   became a commitment (`C.6`), which Project B satisfied in **its own ledger** (`C.8`, `C.9`), whose
   accepted revision was fulfilled (`C.12`) and adopted locally (`C.14`).
3. **Structural change → institutional evaluation → later architectural context.**
   A governed organization evolution activated (`S.2`); the crash window was real (`S.3`); a cold
   restart reconstructed exactly one intervention (`S.4`); a later ordinary experiment linked to it
   (`S.7`, `S.8`).
4. **Empirical experience → Procedure → later worker behavior.**
   The linked evaluation and the intervention grounded the method (`P.1`); the method changed
   Generation 1's behavior (`R1.7`).

**[INTERPRETATION]** Chain 1 is the one I would single out: the *content* of the intent revision came
from the *content* of the failed work, and the revised intent is what Generation 1's worker actually
received. That is compounding in the strict sense — a later generation's starting point is a
function of an earlier generation's findings.

## 7. Manual-assistance ledger

§15/§16 require every place the host had to know something. **The ledger has one entry, and it is the
one the ruling anticipated.**

| generation | what | value | classification | note |
|---|---|---|---|---|
| G1 | durable asset ids | 3 discovered by owner query, **0 remembered** | `EXPECTED_V1_EXPLICIT_CONTROL` | V1 selection is explicit; the ids come from `projectScopedAssets(projectId)` over durable state |

**[MACHINE]** `R1.1` records that the selector discovered the capital by **querying the owners** — 1
proof association, 1 reasoning association, 1 procedure association, 1 adopted journal note — rather
than by recalling opaque ids from the previous session. `G2.6` does the same after the second
restart, and correctly discovers revision **1** (the current one) rather than revision 0.

**[FRICTION] DISCOVERY_FRICTION (partial, recorded not fixed).** The *set* of candidate assets is
discoverable, but the host still has to decide **which** of them are relevant to a given task, and it
must supply the `KnowledgeSelectionRequest` explicitly. For a project with three assets this is
trivial; for a project with three hundred it would not be. §16 says to record this rather than
implement retrieval, so it is recorded: **semantic relevance selection is not solved by V1 explicit
selection.** This is not a semantic blocker — nothing is *unanswerable*, and the stage's correctness
does not depend on it — but it is the most likely place a future stage finds real work.

**[FRICTION] one real integration bug was found and fixed during the dogfood** (see §11): an
un-awaited `dispose()` promise surfaced as an unhandled rejection at an unrelated point. That is an
ordinary harness bug, not a product defect, and §25 authorizes it.

## 8. Authority invariance

**[MACHINE]** §21's list, checked rather than asserted:

- The procedure face exposes **no** authority verb (`assign`, `authorize`, `promote`, `execute`,
  `schedule`, `openCommitment` — `A.3` reports `none`).
- A commitment act left Project A's Work **unchanged** (`C.7`).
- A fulfillment left Project A's ProjectIR **unchanged** (`C.13`).
- Project A's ledger never contained Project B's task (`C.9`); A never owned B's Work.
- Inherited capital did not alter ProjectIR or Work state (`A.1`, `A.2`).
- The procedure owner holds procedures only (`P.3`, and the E5-P firewalls).

Knowledge and methods changed **cognition**. They did not change **permission**.

## 9. G-4 / G-15 pressure results

**G-4 (PeerRef ↔ PersistentPoint): DEFERRED. [MACHINE]** `G4.1`: the collaboration identity
reconnected after **two** cold restarts using `PeerRef` alone — the `ContactNeed` resolved and the
commitment read `FULFILLED`. No correctness failure was observed that would require a persistent
cognitive locus binding. Implementing G-4 here would have been unjustified.

**G-15 (Participation): DEFERRED. [MACHINE]** `G15.1`: every operator question this project raised
was answerable from the existing surfaces — 4 attempts, 2 procedure revisions, 1 intervention, plus
the federation and workspace reads. No user-visible question was found that the existing
Attempt/Activation/Federation surfaces cannot answer.

**[INTERPRETATION]** Both deferrals are honest *for this project*. The dogfood is a small project
with one external peer and a handful of attempts; G-15 in particular would be much more likely to
bite in a project with many concurrent participants, and nothing here proves it never will.

## 10. Machine-proven facts vs. interpretation

**Machine-proven (re-runnable via `pnpm gate:e-live`):**

- The independent acceptance suite fails at H0 (0/8) and at Generation 0's naive implementation (4/8),
  and passes at Generations 1 and 2 (8/8) and for the mature implementations. H0 is a starting point,
  not a deliverable; only the 4/8 result is an implementation a generation actually produced.
- The contradiction surfaced as real test failures: 3 of Generation 0's 4 failures are cycle-related.
- Intent reconciliation was grounded, independent, and wrote nothing when rejected or unresolved.
- The collaboration chain ran with two genuinely separate Work ledgers.
- The crash window was real, and reconciliation reconstructed exactly one intervention after restart.
- P@1 → P@2 supersession, with the old attempt retaining its historical binding and a fresh attempt
  being refused the superseded revision.
- The paired control produced observable differences on an identical task, and `PC.4` proves the two
  conditions shared their acceptance suite and starting point byte-for-byte.
- The `rediscovery_check` difference between inheriting and not inheriting.
- **The consumption is Level 3 (`C.22`).** The worker's implementation is *derived* by interpreting the
  procedure's structured steps against a closed clause vocabulary. Mutating the content changes the
  observable outcome against the unchanged contract: removing the cycle clause, reordering the clauses
  so ordering precedes detection, or dropping validation each make the derived implementation fail.
  A Level-1 consumer (handle → pre-written file) cannot fail that probe.
- Authority invariance across the whole run.

**Observational (true of this scenario, not generalized):**

- The specific method text, the specific finding that motivated P@2, and the extension Generation 2 made.
- The exact refs and digests, which vary per run.

**Interpretation (explicitly not machine-proven):**

- That the observed difference *generalizes* to other projects, models or methods.
- That the derived method is *the* right method, or a good one; only that it is admitted, grounded and
  reusable under its recorded scope and limitations.

## 11. Semantic changes made during the dogfood

**None.** §24 expected `NEW CANONICAL OWNER = NONE` and §25 restricted implementation changes to real
integration/restart/idempotence/live-gate bugs. The stage honoured both:

- **No new canonical owner.** No semantic lifecycle, authority or universal abstraction was added.
- **No product source changed at all.** `git diff --name-only <baseline>..<E-LIVE commit> -- src/ tools/ architecture/`
  is empty.
- **One harness bug fixed:** `rig.close()` did not await the async `dispose()`, so a rejection surfaced
  later as an unhandled crash at an unrelated point in the run. That is a live-gate bug (§25).
- **Three live-gate authoring bugs fixed:** a plan revision that changed a task's meaning under the same
  id (`replacement_task_id_required`); a "probe" attempt that produced no observable work (correctly
  refused by the Work kernel, so the probe was replaced by a real attempt); and a `prepareMutatingWork`
  call made while the scheduler's own next decision was a pending `TASK_READY`.
- **No hotspot ceiling was raised, and `architecture:write` was never run.**

## 11a. Harness corrections made in R0

R0 reviewed this stage rather than extending it, and found three *harness* defects — all in
`scripts/gates/`, none in the product. They are recorded here because two of them had made the
stage's headline numbers wrong:

1. **The acceptance suite was measured before promotion.** `G0.5` and `PC.3` ran the suite against the
   repository HEAD *before* `closeTask` promoted the worker's commit, so they reported the H0 stub's
   0/8 instead of the naive implementation's 4/8. The comparison against Generation 1's 8/8 therefore
   overstated the jump. Both now measure the promoted deliverable, and Generation 1/2 were already
   doing so — which had made the two sides of the comparison measure different things.
2. **The failure count double-reported.** `node --test` prints each failure twice (summary list and
   "failing tests:"), so a line count gave "six failures" for three distinct tests. Now counted as
   distinct test names, and reported as "3 of 4 failures are cycle-related".
3. **Consumption was Level 1, not Level 3.** The worker saw a cycle keyword in the pulled body and
   wrote a pre-written file — a handle-driven lookup. It now *derives* the implementation by
   interpreting the method's structured steps (`scripts/gates/derive-dag.mjs`), and `C.22` proves the
   interpretation is real by mutating the content and observing the outcome change. The paired control
   also now runs literally the same worker factory rather than a hand-copied lookalike, and `PC.4`
   proves the two conditions share their inputs by digest.
4. **One generation-crossing identity was still a JavaScript variable.** Generation 1's reasoning
   `claimId` was carried across the cold restart from generation 0's process. The cell id already came
   from a durable association query, so the claim is now re-read from that cell's own admitted frontier
   (`R1.1a`). §22 asks for a subprocess boundary *or* a proof that every crossing value is re-read from
   durable stores; this closes the last gap in the latter, and the new verdict
   *"every inherited asset id was re-derived from durable state"* fails if one is reintroduced.

The verdict is unchanged in direction and stronger in evidence: the textbook effect was real, and it
is now demonstrated at the consumption level the stage's §13/§20 intended, across a boundary where no
semantic identity crosses in memory.

## 12. Unresolved friction

1. **Relevance selection (§7).** Candidate assets are discoverable; their *relevance* is the host's
   judgement. This is the honest limit of V1 explicit selection.
2. **The dogfood's scale.** One peer, three generations, a handful of attempts. The compounding
   mechanism is demonstrated; its behaviour under hundreds of assets and many concurrent participants
   is not.
3. **Deterministic workers.** §29 requires a deterministic machine gate, so every worker here is a
   host fixture. A stochastic model's behaviour under the same inheritance is observed in the
   companion dogfood run, not in CI — and it is the thing most likely to differ.

---

## Verdict

```
E-LIVE LONG-HORIZON INTELLECTUAL COMPOUNDING: PASS

TEXTBOOK EFFECT: DEMONSTRATED IN DOGFOOD SCENARIO
```

All nine §36 criteria hold: later workers inherited real durable capital; at least one inherited
asset altered later work behaviour; one previously-paid cognitive cost was not paid again; intent
learning composed with later Work; sovereign collaboration composed with local adoption;
institutional learning survived restart; procedural capital survived and superseded correctly;
historical context remained immutable; manual assistance did not secretly carry prior-session
knowledge; and every authority firewall remained intact.
