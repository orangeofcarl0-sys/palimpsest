# G10-B0 — Binding Semantics & PersistentPoint Realization Design

Status: **G10-B0 · BINDING SEMANTICS DESIGN · DRAFT · POST-UAS-1 · NOT IMPLEMENTED · NO PRODUCTION SCHEMA COMMITMENT**

Branched from canonical `main` (`b18b08b`) after PLMP-UAS-1 was published
canonically (Stage 0, recorded in `G10-B0-CANONICAL-PUBLICATION.md`). This is a
design stage: it freezes nothing, implements nothing, and adds no schema,
migration, runtime state, federation mechanic, Ordarium primitive, or DSH
change. The frozen authority is `UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md`
(PLMP-UAS-1); PAL-FED branches were consulted only as evidence and no
experimental code is inherited.

Provenance for evidence claims: `G10-A0-EVIDENCE-MATRIX.md`; current-code facts:
`G10-B0-CURRENT-BINDING-INVENTORY.md`; per-relation decisions:
`G10-B0-BINDING-IDENTITY-MATRIX.md`.

---

## 1. Frozen UAS-1 constraints

Every statement below is normative input from PLMP-UAS-1 and is preserved, not
re-argued:

```text
Architecture ≠ Work ≠ Runtime ≠ Continuity
ConcernDomain ≠ Dimension;  ConcernDomain ≠ CanonicalStore
AgentDefinition ≠ PersistentPoint ≠ RuntimeAgent ≠ Session (pairwise)
Activation ≠ Attempt
Peer collaboration identity ≠ runtime carrier/session identity
WorkGraph ≠ OrganizationGraph ≠ CollaborationGraph
WorkerReport ≠ Evidence;  CollaborationEvent ≠ Evidence
PolicyAdmission ≠ TruthVerification;  EpistemicAdmission ≠ EffectAdmission
UserFocus ≠ AuthorityRoot;  Wake ≠ Ack;  Attention ≠ Collaboration
Conversation ≠ Agreement;  Assignment ≠ Commitment
Ownership ≠ ContactNeed;  Unresolved ≠ Failure
```

Compatibility constraints preserved without reinterpretation: `definition_id` =
Work/Task lineage; `AgentGraph v1` = WorkGraph/task-bearing; `GraphPatch` = Work
patch; `CanvasDoc v3` = Work authoring surface; `Scheduler.decide()` pure and
`Scheduler.commit()` persists the prepared event. The frozen composition is:

$$
RunDefinition = ArchitectureDefinition + WorkDefinition + BindingDefinition + RunConfiguration
$$

## 2. Current implementation inventory (summary)

Full inventory: `G10-B0-CURRENT-BINDING-INVENTORY.md`. Headline facts that
constrain the design:

- **No binding concept exists on `main`.** There is no `BindingDefinition`,
  `PersistentPoint`, `PeerRef`, `RuntimeAgent`, or `ResolvedBinding` type. The
  seam is greenfield.
- Work identity exists and is lineage-based: `TaskProposal.definitionId`
  (`src/architecture/proposal.ts`) → `TaskSpec.definition_id`
  (`src/schema/models.ts`), with `DUPLICATE_DEFINITION_ID` already fail-closed.
  Per UAS-1 `UAS1-INV-05`, a future binding identity must be a **new
  namespace**, never a reinterpretation of `definition_id`.
- The Work capability gate (`src/graph/ir.ts`, `UNSUPPORTED_NODE_KIND` …
  `UNSUPPORTED_RUNTIME_CYCLE`) already implements "declarable ≠ runnable"
  fail-closed. A binding layer's requirement/unsatisfied semantics should feel
  like a sibling of this gate, not a new philosophy.
- Runtime provider/model selection today lives at **runtime/advisory** level:
  attempt attribution `{model, cost}` and `modelCandidates`
  (`src/tools/controller.ts`) — model name strings, resolved per attempt, never
  part of architecture definitions. This independently supports the
  logical-need ≠ concrete-provider separation.
- The runtime-carrier integration seam is deliberately structural:
  `src/tools/dsh_types.ts` mirrors the DSH host contract with `agent?: unknown`
  — Palimpsest currently does not type runtime identity at all.
- Workspace locality is a **host path**: `defaultStatePath(canonicalRepository)`
  resolves a repository path (`src/state/database.ts`); worktrees/scratch are
  allocated by the effects/CLI side (`src/install.ts`, `src/effects/runtime.ts`).
  There is no durable logical workspace identity.
- Scheduler purity is real code (`src/scheduler/scheduler.ts`: `decide()`
  returns the prepared event, `commit()` persists). Binding resolution must sit
  **before/outside** `decide()`, as supplied state.

## 3. Binding problem statement

PLMP-UAS-1 froze `AgentDefinition ≠ PersistentPoint ≠ RuntimeAgent ≠ Session`
and left their concrete relationship intentionally open. Something must connect:

```text
logical Architecture/Work intent
   ↕
durable PersistentPoints (continuity)
   ↕
concrete runtime carriers and resources (DSH Agent/Session, provider, model,
tools, workspace)
```

without collapsing definition into runtime, continuity into carrier, authority
into capability, organization into execution, or commitment into assignment.
That connection is the **Binding seam**, and the frozen `RunDefinition`
composition already names its declarative input: `BindingDefinition`.

## 4. BindingDefinition semantic scope

**Adjudicated (design direction):**

$$
BindingDefinition = DeclarativeBindingIntent
$$

A BindingDefinition expresses:

1. **what logical things need to be associated** — an architecture-level
   agent/role requirement and the continuity/resource classes it needs;
2. **what requirements/constraints apply** — mandatory constraints vs soft
   preferences (§47: the distinction is needed; the constraint language is
   future);
3. **what explicit selections are requested** — pins to *durable* targets whose
   identity is meant to persist (a continuity locus), never pins to ephemeral
   runtime state.

It is **not** current runtime state, **not** a bag of provider IDs and session
IDs, and **not** an agent factory. It does not own lifecycle (§6), does not
grant authority (§9), and does not create organization, collaboration, or
commitment semantics (§10).

## 5. Intent vs resolution vs runtime attachment

**Adjudicated:** the decomposition is real, but it is **two candidate concepts
plus one existing runtime state**, not three new entities:

| Stage | What it is | Status |
|---|---|---|
| **Binding intent** | `BindingDefinition` — declarative, revisioned input | PROPOSED concept (inside `RunDefinition`) |
| **Binding resolution** | the derived concrete association selected for a run/context | PROPOSED derived artifact |
| **Runtime attachment** | the actual current DSH Agent/Session/resource state | **existing DSH-owned runtime state — not a Palimpsest entity** |

$$
ResolvedBinding = Resolve(ArchitectureDefinition, WorkDefinition,
BindingDefinition, RunConfiguration, AvailableContinuityState, RuntimeCapabilities)
$$

is an explanatory relation, not an API. **Decision on §16 options: B** —
binding resolution is a **distinct derived artifact** referenced by (or embedded
in) the derived `ExecutionPlan`, not a folded-in part of it. Rationale:
(i) resolution can fail (`BindingUnsatisfied`) before any plan exists; (ii) its
freshness inputs include a continuity/runtime snapshot that changes
independently of definition revisions (§9); (iii) rebinding replaces the
resolution without disturbing the plan's definition provenance (§8). The
semantic requirement is the point — "resolved associations are derived,
freshness-bound, and replaceable without definition mutation"; the name is
secondary, and Model A/B/C comparison (§11) records the alternative of embedding
resolution in the plan.

## 6. Lifecycle firewalls

```text
BindingDefinition does not own DSH Agent lifecycle.
BindingDefinition does not own Session lifecycle.
```

Runtime creation/resume/disposal remains DSH/runtime concern
(`src/tools/dsh_types.ts` is today's structural seam). Binding describes
association; realization is effectful and separate (§12). Carrier or session
replacement never silently replaces PersistentPoint identity, and resolution
never mutates `ArchitectureDefinition` or `WorkDefinition` (mirroring
UA-INV-4).

## 7. PersistentPoint realization (§57 answered)

1. **Minimum semantic identity** — exactly PLMP-UAS-1 §9: a durable operational
   identity/locus whose continuity is not identical to any one runtime carrier or
   session. The concrete identity scheme is open (and no `PersistentPointId`
   enters production source in this stage).
2. **What may be bound to it** — architecture-level agent/role intent; a logical
   workspace/locality requirement; runtime resources and provider/tool
   selections *at resolution/configuration time*.
3. **What may change without changing its identity** — workspace host path,
   runtime carrier, session, binding revision, architecture revision, work
   revision.
4. **What may realize it** — a DSH Agent + Session today; other carriers later.
5–6. **Survives Session/RuntimeAgent replacement** — frozen yes (PLMP-UAS-1).
7. **Outlives a RunDefinition** — yes (design direction).
8. **Multiple runs reuse it** — yes; a binding must not make the point
   equivalent to a single run instance.
9. **Definition revisions re-binding the same point** — yes; cardinality is
   intentionally open (one definition → several points, several revisions → one
   point, unbound definition → dynamically resolved point are all left possible).
10. **Is point creation part of binding resolution?** — **No (non-default).**
    Resolution selects among existing continuity loci; if none satisfies, the
    outcome is an **unsatisfied binding**, and durable-locus creation/promotion
    remains the intentionally-open dynamic problem. Resolution is not an agent
    factory.

Selection modes (§22): both **explicit binding** (logical role → specific
existing point) and **constraint-based binding** (logical requirement → point
satisfying declared requirements) belong in BindingDefinition semantics; no
matching algorithm is designed.

## 8. Rebinding, freshness, and provenance

- **Rebinding ≠ redefinition.** Carrier unavailable, provider unavailable, point
  resumed elsewhere, workspace moved → replace the *resolution* (runtime
  realization), keeping the same PersistentPoint and the same BindingDefinition.
  Changing the declarative intent is a BindingDefinition revision — a different
  act. No failover mechanism is designed.
- **Independent binding lineage (§39/§66): yes.** A `RunDefinition` must
  unambiguously identify the exact binding intent it was compiled from, so
  BindingDefinition needs its own identity/revision/digest — a new namespace,
  never `definition_id`. Future run provenance should carry independent
  architecture / work / binding / run-configuration revisions rather than one
  opaque digest.
- **Resolution freshness (§40):** a resolution is digest/revision-bound to its
  declarative inputs **plus the relevant continuity/runtime snapshot** it was
  resolved against. Late or stale resolution success is not a committable
  current result — the same governance principle as G9 view/patch freshness.
  No mechanism is built here.
- **Reproducibility vs adaptivity (§68): central and explicit.** The same
  BindingDefinition identifies the same binding *intent*; it need not produce
  the same `SessionId`/`RuntimeAgentId`, because availability may legitimately
  resolve different carriers. The durable pin (when present) is to continuity,
  never to a carrier (§69); pinning a current Session/Agent into durable
  binding is out of scope.

## 9. Provider / model / tool / workspace placement

| Concern | Logical need (Architecture/Work/Binding intent) | Concrete selection (resolution / RunConfiguration / runtime) |
|---|---|---|
| Reasoning capability, context budget, tool *kind* | `AgentDefinition`/`WorkDefinition` requirements | — |
| Provider, model route, endpoint | — | RunConfiguration / runtime (today: attempt attribution + `modelCandidates`, `src/tools/controller.ts`) |
| Tool capability requirement (e.g. web search, repo access) | `AgentDefinition`/Work requirement | concrete tool implementation at binding/runtime |
| Workspace/locality | logical requirement in binding intent | host-specific path at realization (`src/state/database.ts`, `src/effects/runtime.ts`) |

`LogicalNeed ≠ ConcreteProvider` is preserved (PLMP-UAS-1 §66 direction), no
model marketplace is designed, and provider identifiers (DeepSeek agent ids,
OpenAI model names, plugin ids) never enter universal UAS concepts
(provider-neutrality).

## 10. Firewalls (authority, organization, collaboration, commitment, work)

- **Capability vocabulary survives binding:** binding may satisfy
  `RuntimeFeature` requirements and select resources compatible with
  `Competence`; it must not convert runtime capability into authority.
  `Competence ≠ AuthorityGrant`, `RuntimeFeature ≠ AuthorityGrant` hold.
- **No authority smuggling:** no `binding.authority` field semantics; binding to
  a PersistentPoint grants no authority, delegates no commitment power, transfers
  no ownership. Authority representation stays intentionally open.
- **Binding ≠ Assignment ≠ Commitment:** binding a role/point does not mean the
  point accepted a commitment, received authority, or became subordinate.
- **Binding ≠ Organization membership:** no `OrganizationGraph` edge is implied;
  a point can be bound for one run without any durable organizational relation.
- **Binding ≠ Collaboration relation:** no collaboration edge is implied;
  collaboration may emerge at runtime. Binding must not become a predefined
  federation topology.
- **Work routing (§32):** `WorkUnit` does not statically bind to a
  PersistentPoint. The chain is WorkUnit → capability/AgentDefinition
  requirement; binding maps architecture-level intent to points; runtime
  planning maps to Activation/Attempt participation via the intentionally-open
  Invocation/Participation zone.
- **Activation/Attempt orthogonality (§33/§34):** no `taskOwner`-style field;
  nothing in Binding may define Invocation/Participation. Every proposed
  relation was audited against this in the identity matrix (several are marked
  NOT A BINDING RELATION for exactly this reason).
- **Session (§35):** `SessionId` is never durable BindingDefinition identity.
  The separation is `BindingDefinition → PersistentPoint requirement` and
  `resolved runtime plan → current Agent/Session`.
- **Effect authority (§49):** binding a tool/provider does not authorize the
  tool call; Ordarium effect admission remains separate and unchanged.
- **Organization memory (§62) / context (§63):** BindingDefinition stores no
  history, commitments, or accepted decisions, and never embeds a point's
  long-lived context into a RunDefinition; it only selects *which* continuity
  locus participates.
- **Resource allocation (§48/§61):** binding answers "what association is
  desired/acceptable"; allocation answers "how is the resource obtained". Where
  realization has side effects, the split is resolution (pure/derived target) vs
  realization (effectful attachment) — Ordarium may govern those effects; no API
  is designed here.
- **Conflict (§46):** a BindingDefinition may be unsatisfiable (exclusive point
  demands, incompatible features, conflicting workspace/provider constraints);
  resolution fails explicitly. No conflict solver; no silent constraint
  override.

## 11. Alternatives considered

| Criterion | Model A — concrete static mapping (binding names runtime/provider/session objects) | Model B — declarative constraints + derived resolution | Model C — hybrid: explicit durable pins + constraints, derived resolution |
|---|---|---|---|
| UAS-1 compatibility | poor — collapses definition/runtime | good | good |
| Definition/runtime separation | poor (session ids in definitions) | good | good |
| PersistentPoint continuity | poor (carrier pinned, not continuity) | good but cannot say "use *this* point" | good — pins target continuity, not carriers |
| Carrier replacement | breaks | handled | handled (pin survives, attachment re-resolves) |
| Multi-run reuse | poor | good | good |
| Provider/model/tool binding | bakes providers into definitions | good | good |
| Workspace locality | host paths in definitions | requirement-only | requirement + optional durable point locality |
| Freshness/revision safety | weak | strong | strong (resolution digest-bound) |
| Authority non-collapse | risk (ids imply grants) | safe | safe |
| Organization/collaboration non-collapse | risk (topology predeclared) | safe | safe |
| Implementation complexity | lowest | highest | moderate |
| Migration compatibility | poor | good | good |
| Provider neutrality | poor | good | good |

**Recommended semantic model: Model C** (hybrid), with Model B's derived
resolution as the machinery. Rationale: the evidence campaign's persistent peers
are *named durable loci* (`ordarium.main`, `palimpsest.main`), so binding must be
able to pin continuity identity explicitly; pure constraints cannot express
that. Pure static mapping (A) is rejected because it re-introduces exactly the
definition/runtime collapse UAS-1 forbids. Under C, pins are to durable
continuity identity only; everything ephemeral is derived.

## 12. Recommended semantic model (summary)

```text
ArchitectureDefinition / WorkDefinition      (logical intent; existing lineage)
        ↓
BindingDefinition                            (declarative association intent:
                                             pins to durable continuity identity,
                                             requirements, preferences; own revision)
        ↓  Resolve(…)  →  BindingResolution  (derived; may fail: BindingUnsatisfied;
        ↓                                    freshness-bound to inputs + continuity/runtime snapshot)
ExecutionPlan                                (derived executable plan; consumes the resolution)
        ↓  Realization (effectful, outside decide())
RuntimeAgent / Session / resources           (DSH-owned runtime attachment state)
        ↓
Attempt participation                        (via the intentionally-open Invocation/Participation zone)
```

`BindingUnsatisfied` is a configuration/planning condition: it does not imply
task failure, trigger automatic point creation, or delegate authority. No error
code or API is frozen.

## 13. Candidate binding invariants (NOT frozen)

Each reviewed; none adopted as frozen — they are B0's proposal for a later
formal review.

| ID | Statement | Decision |
|---|---|---|
| BIND-CAND-01 | `BindingDefinition ≠ BindingResolution` | **PROMOTE AS DESIGN DIRECTION** |
| BIND-CAND-02 | `BindingDefinition ≠ RuntimeAttachment` (attachment is DSH-owned runtime state) | **PROMOTE AS DESIGN DIRECTION** |
| BIND-CAND-03 | Binding does not redefine PersistentPoint identity | **PROMOTE AS DESIGN DIRECTION** |
| BIND-CAND-04 | Runtime carrier/session replacement does not imply PersistentPoint replacement | **PROMOTE AS DESIGN DIRECTION** (restates UAS-1 in binding terms) |
| BIND-CAND-05 | Binding does not grant authority | **PROMOTE AS DESIGN DIRECTION** |
| BIND-CAND-06 | Binding does not create organization or commitment semantics | **PROMOTE AS DESIGN DIRECTION** |
| BIND-CAND-07 | Binding resolution does not mutate Architecture/Work definitions | **PROMOTE AS DESIGN DIRECTION** |
| BIND-CAND-08 | Resolution is freshness-bound to its declarative inputs and continuity/runtime snapshot | **PROMOTE AS DESIGN DIRECTION** (semantic requirement; no mechanism) |
| BIND-CAND-09 | An unsatisfied binding does not authorize automatic PersistentPoint creation | **PROMOTE AS DESIGN DIRECTION** |
| BIND-CAND-10 | Durable BindingDefinition carries no Session identity | **PROMOTE AS DESIGN DIRECTION** |
| BIND-CAND-11 | Binding is not organization memory and does not embed a point's context | **PROMOTE AS DESIGN DIRECTION** |

Rejected candidates: none of the speculative entities in §55
(`BindingTarget/Slot/Lease/Instance/Session/Broker/Graph`) — none survives the
minimality test ("would removing it re-open a real ambiguity?"). No.

## 14. Intentionally open (unchanged or newly recorded)

```text
PeerRef ↔ PersistentPoint identity-vs-address and cardinality   (frozen-open; Binding needs neither answer)
AgentDefinition ↔ PersistentPoint cardinality                    (open; all patterns left possible)
Invocation / Participation model                                 (frozen-open; not solvable via Binding)
PersistentPoint creation/promotion workflow                      (open; non-default in resolution)
PersistentPointId concrete identity scheme                       (open; none in production source)
BindingDefinition constraint/preference language and schema      (future design)
Binding storage backend (SQLite/file/DSH registry/Ordarium state) (open; no store chosen)
Authority representation                                          (open)
Resolution/realization API shape                                  (open)
```

## 15. Implementation implications (directional only)

- A **new identity namespace** will be required for binding intent (and
  eventually PersistentPoint identity); `definition_id` is never reused.
- A **compiler/resolver seam** will be required between RunDefinition
  compilation and plan derivation, with purity on the resolution side and
  effectful realization outside `Scheduler.decide()`.
- `ExecutionPlan` (or its successor artifact) will need to carry or reference
  freshness-bound resolved associations.
- Current runtime surfaces (`src/tools/dsh_types.ts` structural host contract;
  attempt attribution/model advisory in `src/tools/controller.ts`) are already
  provider-side and will need adapters, not reinterpretation.
- Workspace locality will need a logical-requirement vs host-path split
  (`src/state/database.ts` keeps host semantics).
- No production `PersistentPointId`, no PersistentPoint store, no binding store,
  and no `PeerRef` migration in this stage.
