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
surfaced as six real test failures, not as a harness assertion.

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
| **Acceptance suite outcome** | 0 pass / 8 fail | **8 pass / 0 fail** | **8 pass / 0 fail** |

No single numeric score is produced, deliberately: §31 forbids collapsing this into "an intelligence
score", and the quantities above are not commensurable.

## 4. The textbook effect

This is the stage's central claim, and it is measured behaviourally.

**[MACHINE]** Each generation's worker records an observable `rediscovery_check`:

| condition | inherited method present? | `rediscovery_check` | acceptance suite |
|---|---|---|---|
| **Generation 0** | no | `PERFORMED` | 0 pass / 8 fail |
| **Generation 1** | **yes (P@1)** | **`NOT_PERFORMED`** | **8 pass / 0 fail** |
| **Paired control** (same task, capital withheld) | no | `PERFORMED` | 0 pass / 8 fail |
| **Generation 2** | **yes (P@2)** | **`NOT_PERFORMED`** | **8 pass / 0 fail** |

The mechanism, stated precisely so it can be checked: the worker's implementation is a **function of
the procedure it pulled**, never of the harness. If the inherited body's ordered steps contain the
cycle-first instruction, the worker writes the mature implementation; if it does not, the worker
writes the naive one and must discover the problem itself. The harness never selects the answer — it
supplies the seam, and the inherited method decides.

**[OBSERVED]** Generation 0 paid the discovery cost: it wrote the naive implementation, and the
project's own suite failed it. Generation 1 did not: it inherited P@1, received the handle
`@ctx/procedure/prc-…/0`, pulled the body, and its very first implementation satisfied the contract.

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
  the project's own acceptance run at generation-0 HEAD: 0 pass / 8 fail
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

- The independent acceptance suite fails at H0 and at Generation 0's naive implementation (0/8), and
  passes at Generations 1 and 2 (8/8) and for the mature implementations.
- The contradiction surfaced as real test failures.
- Intent reconciliation was grounded, independent, and wrote nothing when rejected or unresolved.
- The collaboration chain ran with two genuinely separate Work ledgers.
- The crash window was real, and reconciliation reconstructed exactly one intervention after restart.
- P@1 → P@2 supersession, with the old attempt retaining its historical binding and a fresh attempt
  being refused the superseded revision.
- The paired control produced observable differences on an identical task.
- The `rediscovery_check` difference between inheriting and not inheriting.
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
- **One harness bug fixed:** `rig.close()` did not await the async `dispose()`, so a rejection surfaced
  later as an unhandled crash at an unrelated point in the run. That is a live-gate bug (§25).
- **Three live-gate authoring bugs fixed:** a plan revision that changed a task's meaning under the same
  id (`replacement_task_id_required`); a "probe" attempt that produced no observable work (correctly
  refused by the Work kernel, so the probe was replaced by a real attempt); and a `prepareMutatingWork`
  call made while the scheduler's own next decision was a pending `TASK_READY`.
- **No hotspot ceiling was raised, and `architecture:write` was never run.**

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
