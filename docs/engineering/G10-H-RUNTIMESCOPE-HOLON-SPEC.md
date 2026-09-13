# G10-H — RuntimeScope & Holon Spec (frozen)

Frozen against `main @ fc90087`, per H0
([`audits/G10-H-RUNTIMESCOPE-HOLON-ASSESSMENT.md`](audits/G10-H-RUNTIMESCOPE-HOLON-ASSESSMENT.md)).
This freezes only what G10-H must freeze. It does not modify `PLMP-UAS-1`.

## 1. RuntimeScope semantics

> A set of running or recoverable runtime constituents forming a local
> execution / state / policy scope inside an explicit runtime boundary.

It belongs to the **Runtime** dimension. It is not an Architecture definition, a
Work definition, a Continuity identity, or an Organization definition.

```ts
interface RuntimeScopeRef { schemaVersion: 1; scopeId: string }
interface RuntimeScopeDefinition {
  schemaVersion: 1;
  scopeId: string;
  organizationBasis: OrganizationBasisRef | null;   // explicit, optional
}
interface OrganizationBasisRef { organizationDefinitionId: string; revision: number; digest: string }
interface RuntimeScopeBasis { scopeId: string; throughSeq: number; chainDigest: string }
type RuntimeScopeLifecycle = "OPEN" | "CLOSED";
```

## 2. Membership (never a string list)

```ts
type RuntimeScopeMember =
  | { kind: "activation"; activation: ActivationRef }
  | { kind: "child_scope"; scope: RuntimeScopeRef };
```

`OrganizationMemberRef` is NOT a runtime member. Runtime membership is never
copied from an organization member list, and an organization member does not
imply a running `Activation`.

## 3. Nesting (recursive organization)

Single-parent forest: a scope has at most one parent; parentage is expressed by
adding a `child_scope` member to the parent.

```text
Root R ├ Activation A1 ├ Activation A2 └ Child C ├ Activation C1 └ Activation C2
```

Invariants: no self-parent, no second parent, no parent cycle; a closed child or
parent is refused.

## 4. Lifecycle

`OPEN → CLOSED`, derived from events. RuntimeScope lifecycle is distinct from
Campaign lifecycle, Activation lifecycle, and Institution epoch. Closing a scope
terminates neither an Institution nor a Campaign. (QUIESCENT is deferred — no
real use case.)

## 5. Organization association

Explicit and optional. `OrganizationDefinitionId ≠ RuntimeScopeId`. An
Organization never auto-creates a RuntimeScope; an organization revision never
implies a runtime mutation. A scope records the exact `OrganizationBasisRef` it
was opened against; a later organization revision makes that basis **stale**
(derived, never rewritten).

## 6. Holon

A **derived view**, not a store, not a new identity:

```text
HolonView = RuntimeScope + explicit PeerRef association + boundary surface + provenance
```

```ts
interface HolonView {
  scope: RuntimeScopeRef;
  lifecycle: RuntimeScopeLifecycle;
  peer: PeerRef | null;                        // explicit only, never inferred
  boundary: RuntimeScopeBoundary | null;
  organizationBasis: OrganizationBasisRef | null;
  organizationBasisFreshness: "unassociated" | "current" | "stale" | "unknown";
  digest: string;                              // external projection digest
}
```

The `HolonView` never exposes internal constituents, so
`internal reconfiguration ≠ external identity change`. No
`RuntimeScope → PeerRef` auto-creation; no first/main-member representative.

## 7. Boundary

```ts
interface RuntimeScopeBoundary {
  boundaryId: string;
  protocol: string;
  sourceInteractionId: string;   // provenance to a declared OrganizationInteraction
  exposed: boolean;              // external vs internal-only
}
```

A boundary declaration cites its source; a definition-time
`OrganizationBoundaryPort` is not the same object as the runtime boundary.

## 8. Canonical store

`SqliteRuntimeScopeStore`, own file `$DSH_HOME/palimpsest/runtime_scope.sqlite`.
Per-scope append-only events with a chain digest; `open` + `appendAtomic`
(all-present-identical idempotent, partial `recovery_required`, conflict
`event_conflict`, stale basis `basis_mismatch`). Events:

```text
RUNTIME_SCOPE_OPENED · SCOPE_MEMBER_ADDED · SCOPE_MEMBER_REMOVED
SCOPE_PEER_ASSOCIATED · SCOPE_BOUNDARY_DECLARED · SCOPE_CLOSED
```

`RuntimeScopeStore` is separate from Work/Coordination/Continuity/Organization
stores — no truth overlap.

## 9. Policy seam

No second scheduler. `RuntimeScope` may reference a routing-policy ref, but Work
Scheduler stays organization-unaware and runtime policy never grants Ordarium
effect authority. Complex policy engine is out of scope.

## 10. ContactNeed typing

`ContactNeedOrigin` `runtime_scope` becomes `{ kind: "runtime_scope"; scope: RuntimeScopeRef }`
(strict parser, no silent dual-parse).

## 11. Public surface

`advanced` export only. `installed.runtimeScopes?` / `installed.holons?` are
present iff a `runtimeScopeStore` is supplied; absent otherwise (never stubbed).

## 12. Invariants (H-A01…H-A30)

A01 scope ≠ Work scope · A02 scope ≠ Organization · A03 scope ≠ PeerRef ·
A04 scope ≠ PersistentPoint · A05 scope ≠ Activation · A06 org membership ≠
runtime membership · A07 runtime membership ≠ participation · A08 runtime
membership ≠ authority · A09 nested scope acyclic · A10 restart-stable truth ·
A11 explicit external identity, never inferred · A12 internal replacement
preserves external identity when boundary unchanged · A13 Holon exposes boundary,
not raw internal topology · A14 user focus has zero representation effect ·
A15 Organization without runtime · A16 Institution without runtime · A17 Campaign
without runtime · A18 RuntimeScope lifecycle ≠ Campaign lifecycle · A19 no auto
Organization→RuntimeScope/Holon · A20 no auto Coalition→RuntimeScope/Holon ·
A21 no global manager · A22 Scheduler stays organization-unaware · A23 no
duplicate canonical store · A24 typed runtime_scope origin · A25 malformed/stale
scope artifacts fail closed · A26 public surface absent without wiring · A27
runtime policy cannot grant effect authority · A28 org norm permission cannot
grant runtime/effect authority · A29 external identity survives internal
reconfiguration · A30 recursive scope replays deterministically.
