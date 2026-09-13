# G10-I — Organization Dynamics Spec (frozen)

Frozen against `main @ b59fe58`. Adds no ontology and no canonical Dynamics store.

```text
Observation ≠ Diagnosis ≠ Proposal ≠ Transformation ≠ Governance ≠ Activation
```

## 1. Knowledge discipline

Every source family carries `known | unknown | error`. A missing port ⇒ `unknown`, never
`empty`. Any diagnostic that depends on an `unknown` input is `unresolved`, never guessed.

## 2. Subject & basis

```ts
type DynamicsSubject =
  | { kind: "organization"; organization: OrganizationDefinitionRef }
  | { kind: "runtime_scope"; scope: RuntimeScopeRef };

interface DynamicsBasis {
  organization: OrganizationDefinitionRef | null;
  runtimeScopes: readonly { scope: RuntimeScopeRef; throughSeq: number; chainDigest: string }[];
  coordinationHead: number;
  campaigns: readonly string[];
  synchronization: "optimistic_reread";
}
```

## 3. Snapshot

`OrganizationDynamicsSnapshot` — derived, immutable, deep-frozen, deterministic, basis-bound,
restart-reproducible, strictly parsed. Its digest covers subject + basis + policy ref +
normalized observed facts, and excludes wall-clock/presentation/UI/caller labels.

`RuntimeStructuralSnapshot` — the mechanical runtime metrics, all from canonical
RuntimeScope history: scope count, depth, parent/child counts, activation/child member counts,
member additions/removals, reconfiguration count, boundary-change count, peer-change count,
organization-basis freshness, external boundary/peer presence, campaign associations.

## 4. Multi-store consistency

Optimistic read: bases → data → re-read bases; if any base changed, `observation_raced`
(bounded retry), else accept with `synchronization: "optimistic_reread"`. Honest, never
claimed atomic.

## 5. Diagnostics

A **pressure vector** (never one score). Each pressure:

```ts
interface StructuralPressure {
  kind: DynamicsPressureKind;
  standing: "supported" | "unsupported" | "unresolved";
  evidence: readonly string[];
  counterEvidence: readonly string[];
  unknowns: readonly string[];
}
```

Kinds: `STALE_ORGANIZATION_GROUNDING`, `RUNTIME_RECONFIGURATION_CHURN`,
`INTERACTION_CONCENTRATION`, `UNDECLARED_OBSERVED_INTERACTION`,
`DECLARED_BUT_UNOBSERVED_INTERACTION`, `STABLE_FEDERATION`, `SHADOW_ORGANIZATION_CANDIDATE`,
`ZOMBIE_ORGANIZATION_CANDIDATE`, `ENCAPSULATION_CANDIDATE`, `MERGE_PRESSURE`, `SPLIT_PRESSURE`.
An `unknown` input forces `unresolved`. `ZOMBIE` requires all relevant observations known.
`INTERACTION_CONCENTRATION` is a graph statistic, never authority or a causal bottleneck.
`STABLE_FEDERATION` is a first-class supported outcome; recurring collaboration never
auto-creates an Organization.

## 6. Hysteresis

```ts
interface DynamicsPolicyRef { id: string; version: string }
interface DynamicsPolicy { ref: DynamicsPolicyRef; minDistinctBases: number }
```

A diagnostic may be promoted to `persistent` only across ≥ `minDistinctBases` distinct
basis-separated snapshots (enter/exit thresholds optional; first version does persistence
evidence only). Policy ref is always in the provenance; policy ≠ truth.

## 7. Proposal

`OrganizationDynamicsProposal` — non-canonical, immutable, strict, basis-bound,
diagnostic-bound. Kind ∈ {`NO_CHANGE`, `RETAIN_FEDERATION`, `FORMALIZE_ORGANIZATION`,
`REVISE_ORGANIZATION`, `SPLIT_ORGANIZATION`, `MERGE_ORGANIZATIONS`,
`ENCAPSULATE_RUNTIME_SCOPE`, `COLLAPSE_RUNTIME_STRUCTURE`,
`DISSOLVE_OR_RETIRE_CANDIDATE`}. Digest identity (no durable ProposalId store). Advisor port
optional, untrusted, strictly parsed. `maps_to_existing_transformation` ∈
{REVISE, SPLIT, MERGE, unsupported}.

`evaluateDynamicsProposalFreshness` — one shared read-only evaluator; a changed load-bearing
source basis makes the proposal `stale` (never silently reinterpreted).

`ProposalImpactReport` — read-only structural delta / independence-loss / unknown impact; no
performance prediction.

## 8. Zero mutation authority

The Dynamics module imports no canonical mutator (`OrganizationStore.registerRevision*`,
`planTransformationActivation`, institution commit, RuntimeScope structural mutators) except
the H carry-forward closure seams (representation admission, campaign association, boundary
source verification). No `applyProposal`/`activateProposal`/`mergeNow`/`splitNow`.

## 9. Surface

Advanced-only. Independent of `ProjectController`. Installed surface present iff the required
read-only sources are wired; never stubbed.
