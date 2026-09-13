# G10-I I0 — Organization Dynamics Current-State Audit

Baseline audited: `main @ b59fe586ecc04e6086eae3a8aabbc46a332a8b3d`.
Reviewed: UAS-1, G10-E/F/G/GC3, G10-H spec + carry-forward; `src/runtime_scope/**`,
`src/federation/**`, `src/coordination/**`, `src/organization/**`, `src/institution/**`,
`src/campaign/**`, `src/runtime/**`, `src/continuity/**`, `src/install.ts`, `src/advanced.ts`.

## I0-Q1 — What is observable today

| Observation | Status | Source |
|---|---|---|
| Organization definitions / revisions | **canonical** | `OrganizationStore.get/head/lineage` |
| RuntimeScope histories / bases | **canonical** | `RuntimeScopeStore.replay/basis/scopes` |
| Holon external projections | **derived** | `RuntimeScopeService.holonView` |
| Coordination history (messages, contact requests, wake/ack) | **canonical** | `CoordinationStore.replay` |
| Commitments / handoffs | **canonical events**, derived state | `CoordinationStore` |
| Participations / invocations | **canonical events** | `CoordinationStore` |
| ContactNeed bodies | **reference only** (`contactNeedId`) — the artifact is transient |
| Coalition snapshots | **derived** (not stored) | `federation/coalition.ts` |
| Campaign histories | **canonical** | `CampaignStore.replay` |
| Campaign lifecycle | **derived** | `campaign/production.ts` |
| Institution epochs | **canonical** | `InstitutionStore.epochs/head` |
| Work history | **canonical but not exposed** to a dynamics read port (needs `EventStore`) |
| Runtime carriers / Activation liveness | **unavailable / host-owned** (no activation registry) |
| Effect receipts | **host-owned** (Ordarium ledger; not read by Palimpsest) |

## I0-Q2 — Facts vs proxies

A `MESSAGE_PREPARED`/`MESSAGE_DELIVERED` count is a count of message **events** only. It is
NOT transferred context, information value, agreement, coordination quality, or authority.
Likewise: commitment events are not trust; participation records are not liveness; peer
degree is not importance; coalition recurrence is not organization. Every proxy is named as
a proxy in the snapshot.

## I0-Q3 — Does G10-I need a canonical Dynamics store?

**NO.** The design is `source canonical histories → deterministic derived snapshot →
strict diagnostics → non-canonical digest-identified proposal`. No invariant requires replay
beyond what the source histories already provide; hysteresis is expressed by multiple
basis-separated snapshots, not by a mutable dynamics store. Creating one would be a second
truth. (If a future proposal-continuity requirement appears, that is a new-stage decision.)

## I0-Q4 — Analysis subject

A tagged union of existing refs — **no `DynamicsSubjectId`**:

```ts
type DynamicsSubject =
  | { kind: "organization"; organization: OrganizationDefinitionRef }
  | { kind: "runtime_scope"; scope: RuntimeScopeRef };
```

## I0-Q5 — Snapshot basis

Reuses existing basis vocabulary, canonical order:

```ts
interface DynamicsBasis {
  organization: OrganizationDefinitionRef | null;   // current head of the subject org
  runtimeScopes: readonly { scope: RuntimeScopeRef; throughSeq: number; chainDigest: string }[];
  coordinationHead: number;                          // CoordinationStore.head()
  campaigns: readonly string[];                      // sorted campaign ids associated to the subject
  synchronization: "optimistic_reread";              // the honesty label (see §6/I0 consistency)
}
```

The snapshot answers "which world state is this diagnosis based on?".

## I0-Q6 — Mechanical metrics only

Observable: scope count; nesting depth; parent/child count; activation-member count;
child-scope-member count; member additions/removals; reconfiguration count; boundary-change
count; peer-association-change count; organization-basis freshness; external boundary/peer
presence; campaign associations; organization member/role/interaction counts; coordination
event counts; distinct peer edges; active commitments; handoffs; participations.

Not observable (never invented): semantic context overlap, true information mutual
dependence, reasoning diversity, actual error correlation, token transfer cost, quality gain.

## I0-Q7 — Temporal persistence / hysteresis

Minimum mechanism: **multiple basis-separated snapshots + an explicit versioned
`DynamicsPolicy`** (minimum distinct observation bases). A single current snapshot may never
prove "persistent"/"stable"/"shadow"/"zombie". No `Date.now` + hidden window; any window is
an injected, versioned policy field.

## I0-Q8 — Relation to G10-F transformations

`planTransformationActivation` / `evaluateOrganizationTransformation` provide REVISE / SPLIT /
MERGE with proof obligations. G10-I proposals carry an honest `maps_to_existing_transformation`
field (REVISE | SPLIT | MERGE | unsupported). No second transformation language; no activation.

## I0-Q9 — Untrusted advisor seam

Optional host-injected `OrganizationDynamicsAdvisorPort`. Its output is `unknown`, strictly
parsed, basis- and diagnostic-bound; it has no mutation authority and is never an embedded
model call.

## I0-Q10 — Production E2E

§44's scenario, driven through real SQLite stores and the installed surface, including a
`STABLE_FEDERATION` outcome (§45) and the full negative suite (§46).

## Multi-store consistency (I0 Q on §49)

Palimpsest has no global ACID transaction across stores. Chosen protocol (honest optimistic):
read all bases → read source data → re-read all bases → if unchanged accept, else
`observation_raced` after a bounded retry. The snapshot's `synchronization` label records the
actual guarantee. No silent mixing.

## Decisions summary

| Question | Decision |
|---|---|
| Dynamics store | none (derived snapshot + digest proposal) |
| Subject | tagged union of existing refs |
| Basis | multi-store refs, canonical order, optimistic-reread label |
| Metrics | mechanical only; unknowns named |
| Hysteresis | multi-basis snapshots + explicit `DynamicsPolicy` |
| Mutation authority | none (carry-forward closure seams excepted) |
| Export | advanced only; no ProjectController |

No stop condition applies: no UAS-1 change is needed, no merged truth store, no dynamics
mutation authority, no main-agent authority root, no message-volume truth, no global manager,
no Scheduler change, and an honest multi-store consistency protocol exists.
