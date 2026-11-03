# Trajectory-T0 — Owner-Referenced Temporal & Causal Projection

**Stage:** `Trajectory-T0`
**Baseline:** `fae6c668685a23da6839da3069707d3de2e91121` (branch `r3-l0c-g1b-evidence-binding`)
**Branch:** `trajectory-t0-owner-referenced-projection`
**Module:** `src/trajectory/**` (L2) + `src/composition/trajectory.ts` (L5)
**Architecture:** `architecture:check` PASS — 0 violations. `check-public-api` PASS — 0 missing, 0 changed kind, 0 added.

---

## 1. The equation

```
Trajectory = Owner History + Provenance Relations + Temporal Currentness
```

Palimpsest already records everything a project's evolution consists of. What it did not have was a
read-only way to **explain** that evolution without becoming another authority over it. T0 is that
explanation layer, and nothing else.

## 2. What T0 owns, and what it refuses to own

T0 owns the **interpretation and presentation of references**. Every node names a fact an existing
owner recorded; T0 never copies the artifact and never re-decides it.

| T0 does | T0 never does |
| --- | --- |
| reference an owner's event by canonical identity | decide Work state |
| describe a relationship an owner's record establishes | verify Proof |
| report currentness as a separate fact | accept a Reasoning Claim |
| report an unresolved relationship as unresolved | change ProjectIR or promote a result |
| build a deterministic read model | write to any canonical store |

The module has no store, no scheduler, no writer and no model seam. `readOnly: true` on every
projection is a description of the code, not a promise about discipline.

## 3. The four separate dimensions (T0-B3)

A single ordered enum would treat `HOST_OBSERVED`, `ADMITTED` and `CURRENT` as interchangeable
levels of truth. They are not. An admitted Reasoning Claim can be historically valid while its
current standing is stale — those are different facts, so they are different fields:

| dimension | vocabulary | question it answers |
| --- | --- | --- |
| `authenticity` | `OWNER_RECORDED`, `LOWER_TRUST_OBSERVATION`, `UNRESOLVED` | did an owner record this? |
| `epistemicStatus` | `RECORDED`, `CANDIDATE`, `ADMITTED`, `INVALIDATED`, `PUBLISHED`, `OBSERVED_UNVERIFIED`, `UNRESOLVED` | what did the owner decide at the time? |
| `currentness` | `CURRENT`, `CHANGED`, `STALE_BY_OWNER`, `UNAVAILABLE`, `UNKNOWN`, `RACED` | does the owner still stand behind it? |
| `completeness` | `COMPLETE`, `PARTIAL`, `MISSING_SOURCE` | how much of the source did we see? |

## 4. Edges: a description, never an authority (T0-B4)

```
ESTABLISHED_BY_OWNER_REFERENCE   an owner record states the relationship — carries the exact evidence
TEMPORAL_ONLY                    same owner, adjacent sequence — ordering, never causation
DECLARED_ONLY                    someone declared it; no owner corroborates it
UNRESOLVED_SOURCE                the source the relationship needs is missing
CONFLICTING_SOURCE               the source exists but disagrees
```

Invariant, asserted in both real-owner scenarios and in the falsifiers:

> `evidenceState === ESTABLISHED_BY_OWNER_REFERENCE` ⟺ `evidence !== null`

An established edge carries `{ byReference, carryingField, compared }` so a reviewer can re-check the
equality rather than trust it. There is no generic `CAUSED_BY`: no relation name in the vocabulary
contains `CAUS`, and adjacency is emitted only as `SAME_OWNER_SEQUENCE_SUCCESSOR` with
`TEMPORAL_ONLY`.

An edge never authorizes Work execution, settlement, Proof publication, Reasoning admission,
ProjectIR revision, promotion or spending.

## 5. The multi-owner Basis Vector (T0-C)

Palimpsest has several independent histories and **no shared wall-clock timestamp makes them
globally atomic**. T0 therefore fabricates no global clock; it records the actual position in each
available owner history:

```
work:      { projectSequence, eventDigest, projectIrRevision, projectIrDigest }
projectIr: { revision, digest }
reasoning: [ { cellId, throughSeq, chainDigest, frontierRevision, frontierDigest } ]
proof:     { scopeId, throughSeq, chainDigest }
journal:   [ { throughSeq, chainDigest } ]
world:     [ { attemptId, capturedAtRevision, basisDigest } ]
completeness: COMPLETE | INCOMPLETE | RACED
unavailable: [ every owner that could not be read, with the reason ]
```

An absent owner is `NOT_COMPOSED`, **never** an empty history. `completeness` is a first-class field
so no reader can mistake an incomplete projection for a globally consistent snapshot.

**Observation-window consistency.** Where the owner supports basis reads: read basis → read history →
read basis → compare. A moved basis marks the window `RACED` rather than silently re-reading. This is
an optimistic observation protocol, and T0 does not claim otherwise.

**`asOf`.** A cut refers to an explicit owner cursor. A non-genesis interval **requires** a validated
predecessor basis — T0 never assumes the previous digest is the genesis digest. An old Attempt keeps
the authorization, context and world basis it actually had; a later ProjectIR revision cannot rewrite
the interpretation of a previous Attempt.

**Currentness.** A digest difference establishes `CHANGED`, never semantic invalidity.
`STALE_BY_OWNER` is assigned **only** where the owning capability's own semantics support it — a
reasoning frontier that no longer holds a claim, a proof claim whose effective standing was
recomputed. Everywhere else the honest answer is `CHANGED`, `UNAVAILABLE` or `UNKNOWN`.

## 6. The two real-owner paths

### Scenario A — `Work Result → Rework → New Attempt` (§6)

Produced by the real `ProjectController`, `EventStore`, Effects runtime and the governed
`appendReworkReopening` seam. **16 tests pass.**

```
A0 authorized by its own envelope  →  A0 reported a result  →  result promoted
   →  governed TASK_READY with actual rework_provenance  →  E1 authorizes A1
```

Measured: A0 and A1 are distinct nodes with distinct authorizations; the rework edge's
`origin_result_subject.ref` is A0's actual completed result; the promotion edge exists only where the
`PROMOTION_COMMITTED` event does; a later change to the task's **current** envelope row does not
rebind A0's historical authorization; an `asOf` cut before A1 excludes it and keeps its digest.

### Scenario B — `Reasoning / Proof → Grounded Intent Revision` (§7)

Produced by the real Reasoning, Proof, Project Workspace and Project Intent services through
`installPalimpsest`. The admission authority is a **deterministic test policy**, not independent
real-world approval — and the evidence says exactly that. **14 tests pass.**

```
Cell → Branch → Candidate → Verification/Admission → admitted Claim
Proof Source → Evidence → Candidate → Verification → Publication → published Claim
Association → Intent Ground → Proposal → Accepted Receipt → PROJECT_REVISED
```

Measured: Branch (`br-`), Candidate (bare 64-hex) and Claim (`cl-`) are distinct identities; an
accepted Receipt's `proposalDigest` equals the proposal's; the three ground kinds resolve to the
Proof, Reasoning and Workspace owners; a later claim invalidation leaves the historical receipt
byte-identical while the node's currentness becomes `STALE_BY_OWNER`.

## 7. The read model (§9)

`buildTrajectoryReadModel` answers, from actual owner facts: which Project Basis is described, which
canonical events changed the project, which Attempts produced accepted results, which results were
reopened, which Grounds informed accepted Intent changes, which relationships remain unresolved,
which historical facts are now changed or stale, and which references a future Agent can safely
resolve.

It answers those questions **with caveats, not permissions**: it never injects the whole trajectory
into a prompt, and it never promotes a failed Attempt or a negative result into capital. A future
Context owner selects specific references under existing authorization and budget rules.

## 8. The G1-B boundary

G1-B can produce authentic local spawn/pid/exit observations on its healthy path. But its Correlator
still exposes caller-controlled trust admission surfaces and does not enforce every claimed
Run/Claim/Readback relationship for all inputs. T0 therefore classifies conservatively:

> The maximal admitted status of a host observation inside T0 is
> `LOCAL_HOST_OBSERVATION_UNVERIFIED_FOR_CAUSAL_ADMISSION`.

A producer's own `RUN_ATTEMPT_CORRELATED` claim is recorded and **never** promoted to an edge. The
G1-B Correlator was not modified in this stage; the flaw is recorded as a forward finding.

## 9. Architecture and scope

`src/trajectory/**` contains only stable types, source-reference validation, projection semantics,
currentness interpretation and deterministic read-model construction. `src/composition/trajectory.ts`
is the one adapter that sees the concrete owners, and it exposes reads only. No owner imports
Trajectory, so no reverse dependency exists.

Not introduced: Trajectory SQL tables, a persistent scheduler, new durable Work events, a second
canonical ProjectIR projection, a global event-ordering service, agent memory transcription,
autonomous synthesis, a background re-indexing daemon, a UI framework or a model-facing action tool.
An optional cache or index would be future work; it is not implemented here.

## 10. What a successful T0 proves, and what it does not

**Proves:** Palimpsest can reconstruct a trustworthy project evolution view from actual Work,
Reasoning, Proof, Intent and Workspace owner histories; preserve the historical basis of each fact;
establish only source-backed relationships; and refuse to turn unresolved observations into
canonical truth.

**Does not prove:** that every project evolution is causally understood, that multi-Agent
collaboration is autonomously intelligent, or that real PRIMARY execution is ready. T0 does not claim
a generic causality engine.
