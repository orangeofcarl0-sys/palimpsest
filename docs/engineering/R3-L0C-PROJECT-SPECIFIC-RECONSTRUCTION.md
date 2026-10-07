# R3-L0C — PROJECT-SPECIFIC RECONSTRUCTION

**Stage:** R3-L0C · **Branch:** `r3-l0c-project-specific-reconstruction` · **Start:** `e51df1f4c2a666ffa7364dbdc108eb9eb7eae2fb`

**OUTCOME: BLOCKED.** The experiment ran all 16 scheduled sessions and then stopped, because the CAPITALIZED arm
received no capital. The treatment was never delivered, so the run cannot speak to the research question and no
verdict is reported from it. §23 requires exactly this: *"If a load-bearing harness/analysis defect is discovered
after behavioral exposure: STOP and preserve completed runs."*

---

## 1. What this stage was for

R3-L0 tested **generic** engineering lessons — "validate before mutate", "freeze the closure". A null result
there is uninformative, because a capable model may already hold those as prior knowledge. This stage tests
**project-specific** invariants whose values cannot be derived from any maxim, so the capital carries information
the prior does not.

The question, in the ruling's words: *when the correct project-specific operating knowledge is recoverable from a
substantial raw Project history, does governed current-standing cognitive capital reduce the cost and
unreliability of reconstructing that knowledge?*

The distinction the whole design rests on is `HistoricalKnowledge ≠ CurrentStanding`. Raw history contains the
invariant's whole lineage — the initial rule, every revision, what superseded what. Current standing is the
*conclusion*. H must derive it; C is handed it. That is the compression being measured.

---

## 2. What was built and verified

### The project family (§3–§6)

A legacy entitlement cutover service with two invariants that are **not** generic maxims:

| Invariant | The rule in force | The fact a prior lacks |
|---|---|---|
| **I1** | a DENY recorded **before the tenant's cutover date** is final; from the cutover onward the newer decision wins | the tenant's **cutover date** — a prior offers "deny wins" and "latest wins" and cannot choose |
| **I2** | three named legacy capabilities are consolidated, and the **capability** — not the named record — is the unit of access | the **three capability names**, and which record is authoritative |

Both lineages are recorded with their initial rule, every revision, what each superseded and why, plus
applicability and limitations. Each invariant names the specific fact a generic prior cannot supply, which §4
requires and which is what makes H a reconstruction task rather than a knowledge test.

### The raw-history corpus (§5)

26 documents, 23.5 KB, across all seven required categories: incidents, decisions, revisions, verification,
migration, current-and-superseded rules, and ten ordinary irrelevant-but-plausible documents. Every superseded
document **says so in its own text**, so the difficulty is `search + chronology + standing reconstruction` and
never misleading noise. `corpusCoverage().complete` is `true` and asserted.

### The current-standing capital (§6, §8)

Per invariant: one admitted **ReasoningClaim** (the standing conclusion) and one active **Procedure** revision
(the method for applying it). The historical **Proof** claim is admitted as *backing* and is **never selected**.
The bundle records what derivation it removes, so the compression is visible rather than asserted, and
`futureCaseLeakage()` proves mechanically that no body names a diagnostic case id or quotes a fixture literal.

### The oracle (§15)

Eight classes over two invariants, judged mechanically. Verified **solvable** (a reference implementation derived
from the corpus rules scores 100%) and **discriminating** (H0 fails exactly P1/P4/P5 — the project-specific
classes). Neither invariant is an unmeasured gap.

### The infrastructure repairs (§2)

| Repair | The defect it closes |
|---|---|
| `EXPLICIT_EVIDENCE_MODE` | a gate read `scratch ?? committed`, so a green result's provenance was unknowable. LIVE now refuses to degrade to a frozen artifact; every output carries source, digest and freshness |
| `BASELINE_DERIVED_IMMUTABILITY` | the protected set was a hand-maintained list, so a new stage had to edit a **completed** stage's script. The set is now derived as the baseline Git tree minus the current stage namespace |
| `PER_RUN_TEMP_ROOT` | a global sweep deleted a live nested run's rigs. A run now owns a lease-bearing root, and a sweep refuses to remove a root whose lease names a live owner |

All three are GREEN, verified by their own tests.

### Containment (§10)

The R3-L0B layout is reused. **One real gap was found and closed.** Measured through the shipped runner and the
shipped kernel label: in this stage's layout each unit's state sits *beside* its world and every sibling unit is
one `..` away, so a worker **reads a sibling world's source successfully** — the fence derives its roots from the
worker's own position and knows nothing about the other units. Declaring each sibling world closes it
(`EPERM`). The units root cannot be declared instead: it is an ancestor of the world and labelling it kills the
worker. Both the defect and the repair are asserted in `test/r3l0c_containment.test.ts`.

### Pre-execution gates

Build clean · unit **3703/3703** · e2e **38/38** · architecture 0 violations · public API 0/0/0 · anti-vacuity
PASS · R3-S0 systemic 47/47 · R1-H/HR/HC/L PASS · containment canaries 32/32 with liveness 10/10 ·
**SYSTEM_VALID: YES · EXPERIMENT_VALID: YES**.

---

## 3. The defect that stopped the stage

All 16 sessions executed. Then the measurement showed the treatment had never been delivered:

| | C sessions |
|---|---|
| reported `knowledgeSelected: true` | **8 / 8** |
| actually compiled a handle | **0 / 8** |
| governed pulls | **0** |

The selection was sent as `{ handles: [...] }`. The host contract is:

```ts
interface KnowledgeSelectionRequest {
  readonly proof?:      readonly { claimId }[];
  readonly reasoning?:  readonly { cellId; claimId }[];
  readonly procedure?:  readonly { procedureId; revision; reason }[];
}
```

An unknown field is **ignored**. So the delegation accepted the request, the attempt reported a successful
selection, and nothing reached the worker. The CAPITALIZED worker received exactly the RAW_HISTORY surface, and
both arms were identical on the treatment dimension.

**Why it was silent.** Every host-side signal said the selection had been made. The `knowledge` field was
present, the delegation accepted it, and the attempt record reported `knowledgeSelected: true`. Only the
**consumer-boundary payload** — the thing the worker was actually handed — showed zero compiled handles. This is
precisely the failure mode the R3-L0B consumer-boundary witness exists to catch, and it is the first time that
instrument caught a real delivery defect in a scheduled run.

### The repair, verified

The selection now uses the owner shape. It is verified **on the real generation child**, not on the shape alone:
a child driven against the real prehistory compiled **2 handles**, delivered both to the consumer boundary, and
resolved both through the governed pull (257 and 2136 body bytes, real digests). That is now a permanent test,
`test/r3l0c_selection.test.ts`, because a dummy fixture **cannot** exercise this boundary — a selection only
compiles against a project whose associations exist, so a dummy refuses with `KNOWLEDGE_NOT_PROJECT_ASSOCIATED`.

A static shape assertion in `test/r3l0c_harness.test.ts` pins the field names, so a refactor cannot reintroduce
the defect.

### Why no verdict is reported

Both arms saw an empty capital surface. Any difference between them is noise; any similarity is uninformative.
Reporting a compression verdict from this run would be reporting the **absence of a treatment** as a finding
about the treatment. §26 makes the consequence explicit, and it is carried in the artifact:

- `RECONSTRUCTION_COMPRESSION` — **not reported**
- `NET_COGNITIVE_COST` — **not reported**
- `CAPITAL_UPTAKE` — **ABSENT**, which is a fact about the harness, not about capital

The run is **preserved** (a `PRESERVE` marker the sweep routine honours as ACTIVE regardless of lease state),
because the defect is itself a finding worth keeping.

### Plan immutability (§23)

The committed plan is **unchanged**. The harness digest drifted after exposure (`scripts/r3l0c/capital.mjs`),
and that drift is **recorded** in `protocol-deviation.json` rather than repaired by amending the plan. §23
forbids the amendment, and the plan's own `smokePolicy` states the rule.

---

## 4. Regression (§29, post-execution)

| Gate | Result |
|---|---|
| build | clean |
| unit | **3713 / 3713** across 273 files |
| e2e | **38 / 38** |
| architecture | 0 violations |
| public API | 0 / 0 / 0 |
| anti-vacuity | PASS |
| R3-S0 systemic | 47 / 47 |
| R1-H / R1-HR / R1-HC / R1-L | all PASS |
| historical evidence immutability | PASS over 333 protected files |
| R3-L0C tests | 111 (contract 59, harness 23, containment 5, selection 6, immutability suite) |
| **SYSTEM_VALID** | **YES** |
| **EXPERIMENT_VALID** | **YES** |

Validity remained green **after** the matrix, so the stop is a harness verdict rather than a validity failure.

---

## 5. Canonical / product / runtime diff

**`src/` and `host/` diffs are ZERO.** Every change is harness, test or evidence. The only prior-stage files
touched are `scripts/r3l0b/immutability.mjs` and `scripts/r3l0a/immutability.mjs`, where the **derived** tolerance
replaces a hand-maintained list — §2.2's repair, applied where the defect was found, with semantics unchanged
and changes or removals still fatal.

---

## 6. Unresolved risks

- **The research question is unanswered.** The design, the project family, the corpus, the oracle and the
  containment are all built and verified; the treatment delivery is repaired and now tested. What is missing is
  an execution with the treatment actually present.
- **The defect was reachable because the preflight did not exercise the C boundary.** That is now closed for the
  delivery path by `r3l0c_selection.test.ts`, but a future stage should run that test as a **pre-trial gate**
  rather than as part of the suite.
- **The first run's 16 sessions are unusable as primary data** and are preserved only as evidence of the defect.
- **The sibling-world declaration is per-run and computed per trajectory.** A future layout change that moved
  units would need the same treatment, and `test/r3l0c_containment.test.ts` asserts the defect so such a change
  fails loudly rather than silently reopening the gap.
