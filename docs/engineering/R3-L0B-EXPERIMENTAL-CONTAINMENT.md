# R3-L0B — EXPERIMENTAL CONTAINMENT AND INTERFERENCE ADJUDICATION

**Stage:** R3-L0B · **Branch:** `r3-l0b-experimental-containment` · **Start:** `a465f8eff8ccfab73d238227b493e325b30ab080`

**This is a NO NEW MODEL RUN stage.** No model was invoked, no R3-L0 session was rerun, and no trajectory was
authored. Every finding below is reconstructed from durable artifacts R3-L0 already left on disk, or produced
by deterministic canaries driven through the shipped runtime.

---

## 1. What this stage had to settle

R3-L0A discovered that the R3-L0 generation harness wrote its own host-side artifacts — the generation spec, the
control payload, the transcript, and the run-level progress record — into directories the worker could read, and
that some workers walked out of their world into the checkout and into a sibling unit. That finding left two
questions open, and this stage exists to answer them:

1. **Does the containment defect invalidate the R3-L0 result?** Partly. The MECHANISM evidence is untouched;
   the BEHAVIORAL causal interpretation is not identifiable. §2 freezes that split rather than choosing one.
2. **Can the defect be closed?** Yes, as a pure layout change, with no product or runtime code modified.

A third question turned out to matter as much as either: **was the containment gate itself worth anything?** A
gate that reports PASS because it never runs, or because its probe can never fail, is worse than no gate. §11–§13
answer that with a liveness control and two mutations, each of which must fail its gate and pass on the
corrected layout.

---

## 2. The two evidence classes of R3-L0 (§2)

The ruling requires the distinction to be FROZEN, not argued case by case, so it is data in
`scripts/r3l0b/contract.mjs`:

### Still valid mechanism evidence

| Fact | Value | Why the containment defect does not touch it |
|---|---|---|
| `SYSTEM_VALID` | `YES` | the four truth layers, loop matrices, cross-loop closures and six mutations are kernel facts, measured without a model |
| `CAPITAL_DELIVERY` | `CLOSED` | the consumer-boundary witness is a property of the delivered payload, not of what a worker later read |
| `CAPITAL_UPTAKE` | `CLOSED` | uptake is decided by the governed pull resolving |
| `HISTORY_ACCESS` | `OBSERVED` | an observation about tool traces |
| `CAPITAL_OVERHEAD` | `OBSERVED` | a measured byte and pull count |

### Behavioral causal status

`PERR CAPITAL EFFECT = NOT IDENTIFIABLE`, for three named reasons:

- **`HISTORY_ONLY_FLOOR`** — `HISTORY_ONLY` reached PERR 0.000 in all four blocks, so the primary endpoint had
  no room to discriminate. This alone would have made the comparison uninformative.
- **`OUTCOME_ORACLE_EXPOSURE`** — four sessions reached the research diagnostic oracle, which IS the outcome
  instrument.
- **`CROSS_TRAJECTORY_INTERFERENCE`** — two sessions read another unit's world or promoted source, which crosses
  the experiment's own unit boundary.

The preregistered `TRAJECTORY_UTILITY: MIXED` verdict is **preserved, not deleted**. It remains the protocol
output it was; only its causal reading is superseded.

---

## 3. ExperimentValidity (§3, §16)

`ExperimentValidity` is an **experimental evidence concept only**. It is not registered, not exported on a
package surface, and not reachable by product code. Nothing in this stage became canonical authority.

Five components, each a separate question with a separate answer, **never averaged or collapsed**:

| Component | Question | Verdict |
|---|---|---|
| `TREATMENT_INTEGRITY` | did the arms differ only where the treatment says? | PASS |
| `CONTAINMENT` | could a worker reach host-private artifacts? | PASS |
| `OUTCOME_BLINDNESS` | could a worker reach the outcome instrument? | PASS |
| `UNIT_INDEPENDENCE` | could one unit reach another? | PASS |
| `EVIDENCE_IMMUTABILITY` | did the evidence survive unmodified? | PASS |

§16 makes the verdict a **conjunction**, so one red component invalidates the experiment and the failing
component is always named. The behavioral-claim law is enforced in both directions, because R3-L0 failed in one
direction and the containment defect in the other:

> A behavioral mechanism claim requires `SYSTEM_VALID = YES` AND `EXPERIMENT_VALID = YES`. Task success or
> favorable behavioral outcomes cannot repair either failure, and a mechanism success cannot repair an invalid
> experiment.

The task outcome is **not an input** to that decision — asserted directly in the tests.

---

## 4. The ExperimentContainmentEnvelope (§4)

Machine-readable, research-only, in `scripts/r3l0b/contract.mjs`.

**Worker-visible:** own worktree/world · intended task files · explicitly declared raw Project history ·
intended Context index · governed pulled bodies · normal tool surface.

**Host-private:** diagnostic oracle · hidden acceptance · reference solution · harness implementation ·
schedule · primary evidence records · control payload · sibling trajectory worlds · sibling promoted source ·
analysis code.

The two sets are asserted **disjoint**, and every entry carries a checkable requirement plus the R3-L0 path
template that shows where the defect actually put it.

---

## 5. The interference graph (§5–§8)

Rebuilt from the **24 durable session artifacts alone**, with no new worker call. The matrix's own committed
attribution supplies arm/block/generation, so the graph cannot disagree with the experiment's own record.

### Why the instrument was rebuilt

R3-L0A matched substrings against a session's whole decompressed text, which reports that a path APPEARED
somewhere — in the worker's own arguments, in a harness echo, or in a returned body. Those are different
experimental facts. The packaged runtime records each tool invocation separately with its `name`, `arguments`,
`isError` and returned `content`, so §5's question ("was content actually returned") becomes answerable.

This stage therefore separates two things that were previously one number:

- **NAMED access** — the worker NAMED a path outside its world. It asked. The read may have been refused.
- **CONTENT exposure** — what the returned content ACTUALLY contained. Only this can establish that an artifact
  reached a session.

Two extraction defects were found and fixed while building it, both of which had inflated the numbers:

- folding Windows separators before scanning turned JSON `\n` escapes into phantom paths (`/nimport`,
  `/nWrite-Output`, `/ngit`) — 102 false `OTHER` accesses;
- the drive-letter pattern matched the `e:` inside a `file:///C:/…` URL, misclassifying a worker's reference to
  its own repository as an exposure.

### The graph

| Class | Accesses |
|---|---|
| `CONTROL_PLANE_EXPOSED` | 95 |
| `OTHER` (temp scratch files outside the experiment) | 73 |
| `CHECKOUT_EXPOSED` | 47 |
| `ORACLE_EXPOSED` | 12 |
| **total replayed** | **227** |

### Session labels (§8)

`CLEAN 18` · `ORACLE_CONTAMINATED 2` · `CROSS_TRAJECTORY_CONTAMINATED 2` · `CONTAMINATED_NON_ORACLE 2`

### Block map (§8)

| Block | Label | Clean | Oracle | Cross-trajectory | Non-oracle |
|---|---|---|---|---|---|
| 0 | `BLOCK_ORACLE_CONTAMINATED` | 4 | 1 | 0 | 1 |
| 1 | `BLOCK_CROSS_TRAJECTORY_CONTAMINATED` | 5 | 0 | 1 | 0 |
| 2 | `BLOCK_CONTAMINATED_NON_ORACLE` | 5 | 0 | 0 | 1 |
| 3 | `BLOCK_CROSS_TRAJECTORY_CONTAMINATED` | 4 | 1 | 1 | 0 |

This map is **descriptive and diagnostic only**. No post-hoc randomized primary analysis was constructed from a
selected clean subset, and the label says so in the artifact rather than only in prose.

### Treatment spillover (§6)

Two sessions read a sibling unit: `b1-C-G2` and `b3-H-G1`, across seven unit pairs. Every one is
`TREATMENT_SPILLOVER_CONFIRMED`, because **content was actually returned** — `b3-H-G1` read
`trials.partial.json`, which carried every unit's diagnostic verdict vector.

The evidentiary bar is enforced in code: a referenced path with no returned content yields at most
`TREATMENT_SPILLOVER_POSSIBLE`, so **file visibility alone can never be promoted to influence**.

### Outcome-oracle exposure (§7)

| Session | module read | case inventory | expected outputs | `classPass` | edited after | outcome-relevant |
|---|---|---|---|---|---|---|
| `b0-C-G1` | ✓ | ✓ | — | — | — | **yes** |
| `b1-C-G2` | ✓ | ✓ | ✓ | ✓ | — | **yes** |
| `b3-C-G1` | ✓ | ✓ | — | — | — | **yes** |
| `b3-H-G1` | ✓ | ✓ | ✓ | ✓ | **✓** | **yes** |

`b3-H-G1` is preserved explicitly as the known decisive case: it is the only session that read the oracle,
received the case inventory, AND edited afterwards — and the only G1 in the experiment to reach full diagnostic
coverage. **No private reasoning is inferred anywhere**; only the observable sequence is recorded.

---

## 6. Root cause (§9)

§9 forbids calling this a production confidentiality defect unless the supported runtime contract promises the
isolation that failed, so the analysis states the promise with its source first.

**The cause is `RESEARCH_HARNESS_DIRECTORY_LAYOUT`.** Every exposed artifact was placed by the harness in an
**ancestor** of the world (`<root>/spec-*.json`) or a **sibling** of the repository (`<run>/<other>/repo`), and
**none was declared** to the shipped fence. The fence derives its protected roots from the worker's position, so
an undeclared ancestor or sibling is outside its scope **by construction**.

| Layer | Verdict | Basis |
|---|---|---|
| `RESEARCH_HARNESS_DIRECTORY_LAYOUT` | **CAUSE** | every trajectory under one shared parent; control files in a world ancestor; the checkout used as harness host was never declared |
| `SECURITY_PROFILE_SCOPE` | **CONTRIBUTING_FACTOR** | the profile confines worker-to-worker and credential reach and does not enumerate a harness's own private files — which is exactly why `PALIMPSEST_WORKER_PROTECTED_ROOTS` exists |
| `PRODUCTION_RUNTIME_DESIGN` | **NOT_IMPLICATED** | the shipped runtime provides the mechanism that contains this class of defect; no shipped promise was violated |

**No product or runtime code was changed**, because no contract was violated. §9's own condition for a
production defect was not met.

---

## 7. The containment repair (§10)

Purely a layout change, in §10's order of preference.

### Preference 1 — separation

```
<root>/units/<unitId>/world/     the worker's world
<root>/units/<unitId>/state/     that unit's durable stores
<root>/units/<unitId>/home/      that unit's DSH home and session space
<root>/private/oracle/           the outcome instrument
<root>/private/control/          specs, payloads, transcripts, progress
<root>/private/reference/        a solved form of the task
<root>/private/evidence/         primary records and the schedule
<root>/private/units/<unitId>/   sibling worlds and promoted source
```

Two structural properties are asserted, not assumed:

- **no host-private root is an ANCESTOR of any world** — the defect that put the control payload above the world;
- **no host-private root is a SIBLING of any world** — the defect that let every unit see every other unit.

Sibling units are held under `private/units/`, so a unit's own tree contains exactly one world: its own.

### Preference 2 — declaration

The sibling-unit root cannot be hidden by position alone if a future layout ever put it back beside a world, so
it is also **declared** to the shipped fence through `PALIMPSEST_WORKER_PROTECTED_ROOTS`. The two preferences
are layered rather than substituted for each other.

### What was deliberately NOT done

- **No prompt prohibition.** §10 is explicit that "prompt prohibition is not containment", and the gate is
  satisfied only by the nonce failing to come back.
- **No product or runtime semantic change.** §9 found no violated promise, so §10's condition for changing
  product code was not met.

---

## 8. The canaries and the mutations (§11–§13)

### The canaries (§11)

Four roots × eight attempts = **32 cells, all measured**. The subject is a real Node process spawned by the
**shipped `dsh-sandbox-windows-acl` runner** under the **shipped Win32 integrity label**, using plain
`node:fs` and `node:child_process` — nothing out of reach of a model's own code. Measuring reachability in the
host process would prove nothing, because the label cannot bind there, so every attempt runs INSIDE the confined
subject.

`EXPERIMENT_CONTAINMENT: PASS` — every cell `UNREACHABLE`, with **zero `NOT_APPLICABLE` gaps**. §11's bar is
"all declared host-private canaries unavailable", so a gap is reported as a gap rather than a pass.

The two attempts that name a specific root (`SIBLING_WORLD_LOOKUP`, `ORACLE_IMPORT_EXECUTE`) receive a MEASURED
equivalent against the other roots, so the denominator stays at eight for every root without inventing a result.

### The liveness control

The same probe, the same canaries, the fence deliberately absent: **10/10 direct reads REACHABLE**. This is what
makes the `UNREACHABLE` result a measurement rather than an empty probe. Without it, a broken probe would report
the strongest possible containment.

### The mutations (§12, §13)

| Mutation | Gate | Mutated | Corrected | Recorded verdict |
|---|---|---|---|---|
| `SHARED_PARENT_MUTATION` | `CONTAINMENT` | FAIL | PASS | `SHARED_PARENT_MUTATION_DETECTED` |
| `ORACLE_EXPOSURE_MUTATION` | `OUTCOME_BLINDNESS` | FAIL | PASS | `ORACLE_EXPOSURE_MUTATION_DETECTED` |

Both halves are required: a gate that never fails measures nothing, and a gate that never passes is not a
repair. A gate failing both ways is reported as `MUTATION_ESCAPED`.

### The breach replay

Stronger than a canary, and kept separate because the two answer different questions: the replay takes the
**exact paths the R3-L0 workers actually read**, recovered from the durable artifacts, and evaluates each
against the repaired information surface.

**227 / 227 historical accesses now blocked. `BREACH_VECTOR_CLOSED: true`.**

This is a **layout test, not a re-run** — no worker is invoked, and the historical path is re-pointed by CLASS
because the literal R3-L0 path no longer exists. A falsifier asserts the replay CAN report unblocked when a
world is the artifact location, so the result is not vacuously true.

---

## 9. Historical evidence immutability (§14, §15)

### The mutator repair (§14)

`test/r2lr_last_mile.test.ts` rewrote `research-evidence/r2-lr/deterministic-suite.json` with a fresh
`recordedAt` on **every unit run**, which made "historical evidence is immutable" unprovable because the suite
itself was the mutator.

The repair keeps GATE R working while removing the mutation: the live result goes to a deterministic test-owned
scratch path under the system temp directory, and the committed record stays frozen. GATE R reads the scratch
record when it exists and falls back to the committed record, so both shapes carry the same two load-bearing
fields and only the location of the live value moved.

### The strengthened guard (§15)

R3-L0A's guard reported a `FAIL` and then carried a second, more forgiving verdict that excluded a known
mutator — the detect-and-continue pattern §15 closes. The strengthened guard has:

- **ONE verdict**, `HISTORICAL_EVIDENCE_IMMUTABLE`, `PASS` only when nothing changed;
- the failing **path and both digests**, so a failure names what changed;
- **no restore function at all**, because §15 forbids the operating mode rather than merely discouraging it;
- `knownPreExistingMutators` retained as a **fact** about the historical record, which does **not** soften the
  verdict — and a still-live mutator is reported as `REGRESSED`, which is itself a failure.

Result: `HISTORICAL_EVIDENCE_IMMUTABLE: PASS` over **323 protected files**, `r2lrMutatorRepair: CLEAN`.

**One narrow, auditable tolerance is required and stated.** The baseline was frozen DURING R3-L0, before
R3-L0 and R3-L0A wrote their own evidence, so their files appear as additions to a baseline that predates them.
The exclusion applies **only to ADDED files under those two exact directories**; a CHANGE or REMOVAL of any
baseline-listed file is still fatal, and the tolerated additions are listed separately rather than absorbed.

### The regression (§14)

Proving "a full unit run cannot change protected evidence" has two parts, because the obvious formulation
recurses:

1. **static and complete** — every test file is scanned for a write under `research-evidence`. A full run can
   only mutate protected evidence if some test writes there, so "no test writes there" is a **complete** proof
   over the whole suite.
2. **dynamic** — the file that had the defect is run in a child process, and the protected tree must be
   byte-identical afterwards.

The child run needs its own config, and that is a real hazard rather than tidiness: `test/global_setup.ts`
performs one temp-directory sweep per run and documents the assumption it depends on — *"this repo runs one
suite at a time"* — because two concurrent runs would each sweep the other's directories. A nested `vitest run`
using the repository config IS that second suite. **It was observed deleting live rigs out from under the
parent**: the full suite failed in a *different untouched* `lean_*` file on each of several attempts, each with
a vanished temp path, and every one passed in isolation. The child therefore runs with `globalSetup: []` and
changes nothing else. With that fix the suite is green.

---

## 10. Laws frozen for future experiments (§17–§20)

- **§17 plan immutability**, carried forward, with the escape hatch **closed**: a real-model behavioral exposure
  cannot be reclassified as "only a smoke" to permit plan amendment. Dummy fixtures only for plumbing tests.
- **§18 post-hoc enrichment**: primary trial records are immutable after execution; token/cost/forensic
  enrichment lives in separate append-only artifacts, and a primary record is never rewritten to add telemetry.
- **§19 pre-ruling**: the next trajectory was **NOT authored**. Only its design requirements are frozen, as
  nine checkable properties — including the two that keep the experiment honest: **the raw-history arm must
  remain capable of succeeding**, and **capital must reduce reconstruction burden, not provide otherwise
  unavailable oracle information**.
- **§20 future outcomes**: five primary outcomes plus terminal functional correctness as a **safety
  co-primary**. **No numerical threshold is frozen in this stage.**

---

## 11. Regression (§22)

| Gate | Result |
|---|---|
| build | clean |
| unit | **3618 / 3618** across 269 files |
| e2e | **38 / 38** |
| architecture | **0 violations** |
| public API | missing 0 / changedKind 0 / added 0 |
| anti-vacuity | PASS |
| R3-S0 systemic suite | **47 / 47** |
| R1-H confinement conformance | **17 PASS · 0 LIMIT · 0 FAIL** |
| R1-HR host-hardening | **44 PASS · 3 LIMIT · 0 FAIL** |
| R1-HC residual closure | **26 PASS · 1 LIMIT · 0 FAIL** |
| R1-L consumer boundary | PASS |
| new experimental-containment mutations | both DETECTED |
| historical evidence immutability | PASS |
| R3-L0B tests | **88 / 88** |

No stochastic or model matrix was run.

---

## 12. Canonical / product / runtime diff

**`src/` and `host/` diffs are ZERO.** The only non-harness file touched is
`test/r2lr_last_mile.test.ts` (§14's required repair) and its reader `scripts/r2lr/gate-r.mjs`. The one
modification to a prior stage's file is `scripts/r3l0a/adjudicate.mjs`, whose exclusion list is a registry that
every later stage must extend — semantics unchanged, and a change or removal of any baseline-listed file is
still fatal.

R3-L0's `90f6b1f`, `be52b08`, `1be2062` and R3-L0A's `bfbf917`, `a465f8e` are **unamended**.

---

## 13. Unresolved risks

- **The R3-L0 behavioral result stays not identifiable.** The containment repair does not repair the executed
  experiment, and §10 forbids rerunning it. The four exposed sessions carry the caveat permanently.
- **Metadata confidentiality is not claimed.** The shipped fence discloses that sibling world NAMES remain
  enumerable; only content is protected. The isolated layout additionally removes the sibling worlds from the
  enumerable tree, but the disclosed residual is the runtime's, not this stage's, to close.
- **`b3-H-G1`'s coverage is unusable as evidence of capability.** It is the only G1 at full coverage and it is
  also the only session that read the oracle, received the case inventory, and edited afterwards.
- **The clean subset is 18 sessions and is descriptive only.** No post-hoc randomized analysis was built from
  it, per §8.
- **The temp-hygiene hazard is documented, not eliminated.** A concurrent second `vitest` run still sweeps the
  first run's directories; the repair here is scoped to this stage's child process, and the global fix would be
  a per-run temp root.
