# G10-H H0 — RuntimeScope & Holon Current-State Audit

Baseline audited: `main @ fc900879c850e14aa6977225790747c314896ce9` (canonical, verified).
Method: direct reads + a full-tree semantic sweep of `scope`/`scopeId`/`scope_id`/
`runtime_scope`/`RuntimeScope`/`Holon`/`group`/`organization`/`PeerRef`/
`PersistentPoint`/`Activation`/`Participation`.

Frozen baselines reviewed: `PLMP-UAS-1`, `PLMP-BIND-1`, `PLMP-AGT-0`, `PLMP-PAG-0`;
`docs/AgentGroup_Theory_v0_Literature_Aligned_Frozen_Spec.md` §3.4 (RuntimeScope =
execution ownership boundary; forest/laminar ownership) and §3.5/§11 (Holon =
internal multiplicity → external unity via interface ∂H and abstraction π_H).
`PLMP-UAS-1` lists "Organization / Holon realization" as `UAS1-INV-16` (open),
so implementing RuntimeScope/Holon is anticipated, not a contract change.

---

## H0-Q1 — every current meaning of "scope"

The token is heavily overloaded. They are **not** to be merged.

| # | Meaning | Representative site | Semantics |
|---|---|---|---|
| 1 | Work runtime-subgraph membership | `src/schema/models.ts:273` `scope_id?`, `src/architecture/proposal.ts:27` `scopeId?`, `src/graph/ir.ts:87` `scope` | owning `mode:"runtime"` subgraph node id (Work definition) |
| 2 | Canvas authoring ownership | `src/canvas/doc.ts:38` `z`, `src/canvas/mutate.ts:264` | presentation-only subflow ownership |
| 3 | VisualGroup | `src/canvas/doc.ts:79-94` `CanvasGroup` | pure presentation, no runtime semantics |
| 4 | Federation effect/intent namespace | `src/federation/messaging.ts:41` `FEDERATION_SCOPE = "federation"` | digest/Ordarium-intent namespace string |
| 5 | Commitment scope | `src/federation/commitment.ts:42` `CommitmentScope` | grounded union: `attempt_participation` \| `contact_need` |
| 6 | Coalition scope | `src/federation/coalition.ts:50` `CoalitionScope` | same vocabulary, coalition identity |
| 7 | `CoalitionView.scope` | `src/federation/workforce.ts:47` | legacy string key projection |
| 8 | `ContactNeedOrigin.runtime_scope.scope` | `src/federation/peer.ts:122` | **untyped, inert** provenance string |
| 9 | Ordarium effect routing scope | `src/effects/runtime.ts:85` `OrchestrationIntent.scope` | effect authorization/routing |
| 10 | Runtime realization invocation scope | `src/runtime/realize.ts:126` | Ordarium invocation scope (default `"runtime-realization"`) |
| 11 | Controller/promotion/gate scope | `src/tools/controller.ts:897` etc. | `= projectId` effect scope |
| 12 | `RuntimeScope` | `src/organization/definition.ts:8` (comment) | **NOT realized** |
| 13 | `Holon` | `src/organization/definition.ts:8` (comment) | **NOT realized** |

Decision: RuntimeScope is meaning #14, new and distinct. It must never alias
Work `scope_id`, any federation/commitment/coalition scope, any effect scope, or
a VisualGroup.

## H0-Q2 — where Runtime canonical vs derived truth lives

- Canonical: `Activation` identity is **allocated, not stored** in any runtime
  registry (`src/runtime/identity.ts:80`; allocator seam `realize.ts:77`). Its
  only durable traces are coordination `PARTICIPATION_*`/`INVOCATION_RECORDED`
  events and Ordarium effect records.
- Derived: `observeBindingState` / `observeAndCompileGroundedPlan`
  (`src/runtime/observation.ts`) compose continuity + an observation port.
- There is **no canonical runtime-organization truth anywhere today**: nothing
  records scope membership, nesting, ownership, or external representation.

## H0-Q3 — where OrganizationDefinition is disconnected from runtime

`OrganizationDefinition` (`src/organization/definition.ts:101`) is a static
immutable artifact; the only cross-module reference is
`InstitutionEpoch.organization: OrganizationDefinitionRef`
(`src/institution/artifacts.ts:238`) and `InstitutionServiceDeps.organizations.get`.
`OrganizationBoundaryPort` explicitly carries "NO runtime meaning"
(`src/organization/transformation.ts:20`). There is no path from any
`OrganizationMemberRef` to an `Activation`, and no path from an `Activation` to
an organization. That is the structural断层 the campaign closes.

## H0-Q4 — reusable information for RuntimeScope

- `PeerContinuityAssociation { peer, point }` (`federation/peer.ts:93`) is the
  established pattern "**association ≠ identity**" — reuse for
  `RuntimeScope ↔ PeerRef`.
- `ActivationRef` (`coordination/participation.ts:51`) is the exact constituent
  identity to reference (never re-derive).
- `Participation { activation, attempt, invocation? }` gives the
  activation→attempt relation; runtime membership must stay orthogonal to it.
- `OrganizationDefinitionRef { id, revision, digest }` gives the basis-ref shape.
- `ManpowerPointView` (`federation/workforce.ts:35`) is the established
  **derived composite view** pattern for a Holon view.
- Institution store's "append-only chain + verified head projection" and
  Organization store's lineage/conflict semantics are the canonical-store
  patterns to mirror.

## H0-Q5 — is `ContactNeedOrigin.runtime_scope: string` real type debt?

**Yes.** It is an untyped opaque string that could smuggle Work scope ids,
PeerIds, or arbitrary text into a typed provenance position, and no production
code validates it. There is no published compatibility burden: only tests use it
(`test/peer_identity.test.ts`, value `"local"`). Decision: tighten in place to a
typed `RuntimeScopeRef`; no silent dual-parse, no legacy-string acceptance.

## H0-Q6 — canonical history or derived-only?

**Canonical history is required.** Membership transitions, parentage/nesting,
organization basis, external peer association, and boundary declarations are not
recorded by any existing history. A derived-only projection would have no source
to derive from, and an in-process map would violate restart reconstruction.
Therefore RuntimeScope gets an append-only, restart-reconstructible canonical
store. (Machine proof: restart → same projection, `H-A10`.)

## H0-Q7 — which store owns it?

New, dedicated `RuntimeScopeStore` (own SQLite file
`$DSH_HOME/palimpsest/runtime_scope.sqlite`).

| Candidate | Verdict |
|---|---|
| Work `EventStore` | ✗ Work owns Work; scope ≠ Work scope |
| `CoordinationStore` | ✗ concern ≠ store: it owns participation/collaboration/commitment; its seq is store-global; stuffing scope events in causes semantic-ownership overlap |
| `ContinuityStore` | ✗ owns `PersistentPoint` identity only |
| `OrganizationStore` | ✗ owns immutable organization revisions; scope ≠ organization |
| derived-only | ✗ impossible (no source) |
| **new runtime-specific store** | ✓ owns exactly RuntimeScope history; no truth overlap |

## H0-Q8 — does Holon need new durable identity?

**No.** Default stance upheld: no `HolonId`. A Holon is a **derived view** over a
`RuntimeScope` plus an explicit external representation (`PeerRef` association)
and an optional boundary projection. The external identity is the explicitly
associated `PeerRef`, recorded as a scope event — never inferred. No counterexample
was found where `RuntimeScopeRef + explicit PeerRef association` is insufficient.

## H0-Q9 — Organization ↔ RuntimeScope cardinality

Not 1:1. Decided:

- Organization may have **0..N** runtime scopes.
- A RuntimeScope has **at most one** optional `OrganizationBasisRef`.
- RuntimeScope may exist with **no organization** backing.
- Organization revisions advance independently; a scope's recorded basis may
  become **stale** without rewriting the scope.

## H0-Q10 — is nested RuntimeScope necessary?

**Yes.** Without nesting there is no recursive organization to prove. Decided:
single-parent **forest** semantics (matching the frozen ownership rule
§3.4 laminar/forest), enforced acyclically: no self-parent, no second parent, no
parent cycle. Multi-parent runtime ownership is deferred (would need explicit
organizational semantics).

## H0-Q11 — minimal executable Holon E2E (frozen before coding)

1. obtain `OrganizationDefinition O`;
2. open `RuntimeScope R` explicitly associated with `O@revision` (basis recorded);
3. add `Activation A1`, `Activation A2` as members;
4. explicitly associate collaboration `PeerRef P` to `R`;
5. a Holon view exposes `P`, the boundary surface, and the R basis — **not** A1/A2;
6. internal reconfiguration: remove A1, add A3;
7. `P` unchanged;
8. boundary unchanged (same external projection digest);
9. restart/replay yields the same external Holon state;
10. a nested child RuntimeScope is encapsulated correctly.

Negative proofs N01–N12 (§26) and invariants H-A01…H-A30 (§27) are frozen in the
G10-H Spec.

---

## Decisions summary

| Question | Decision |
|---|---|
| RuntimeScope identity | new typed `RuntimeScopeRef` (never Work/federation/effect scope) |
| Truth | new canonical append-only `RuntimeScopeStore` |
| Store | dedicated `runtime_scope.sqlite`; no truth overlap |
| Holon | derived view; **no** `HolonId`; explicit `PeerRef` association |
| Cardinality | org 0..N scopes; scope ≤1 optional org basis |
| Nesting | yes; single-parent forest, acyclic |
| Lifecycle | minimal `OPEN`/`CLOSED` (QUIESCENT deferred, no real use case) |
| Constituents | tagged union `activation` \| `child_scope`; never a string list |
| `ContactNeedOrigin` | tightened to typed `RuntimeScopeRef` |
| Public surface | `advanced` only; `installed.runtimeScopes?` / `installed.holons?`, absent without wiring |

No stop condition applies: no UAS-1 contradiction, no required re-interpretation
of `definition_id`/`scope_id`/`PeerRef`/`PersistentPointId`, no Ordarium change,
no global scheduler/manager, and truth ownership is non-overlapping.
