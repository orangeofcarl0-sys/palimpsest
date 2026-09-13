# G10-F3 — Typed Organization Transformation

Status: **COMPLETE**

Baseline: `main` @ `d784d2b` (F2 merged).
Branch: `experiment/g10-f3-organization-transformations`.

---

## 1. Pipeline (§75)

```text
proposal
  ↓
typed candidate transformation        materializeOrganizationDefinition
  ↓
structural validation                 explicit-classification obligations
  ↓
boundary / interface synthesis        OrganizationBoundaryPort
  ↓
proof obligations                     first-class artifacts
  ↓
evidence / admission assessment       TransformationEvidencePort (optional)
  ↓
explicit activation                   planTransformationActivation
  ↓
new immutable Organization revision(s) activateOrganizationTransformation
```

No caller or AI directly mutates canonical organization truth (§74). A
proposal is an immutable planning artifact; it becomes canonical only through
explicit activation (§97).

## 2. Implemented operations (§76)

| Operation | Status |
| --------- | ------ |
| `REVISE`  | implemented |
| `SPLIT`   | implemented (partition + interface synthesis + report) |
| `MERGE`   | implemented (explicit collision/conflict resolution) |
| `EXTRACT` / `INLINE` / `REWIRE` | DEFERRED — no implementation evidence demands them yet |

## 3. REVISE (§77)

A revise proposal carries the base `OrganizationDefinitionRef` and an explicit
candidate `OrganizationDefinition`. Obligations:

- `revision_does_not_advance` (unresolved) if the candidate changes the
  organization identity or does not advance the revision;
- `base_missing` (unresolved) if the base artifact is not supplied;
- `evidence_claim_unverified` (unresolved) if evidence is claimed without
  verification.

Validation of the candidate itself (member/role/assignment coherence, digest)
is owned by `materializeOrganizationDefinition` / `parseOrganizationDefinition`.

## 4. Assessment result

```ts
interface OrganizationTransformationAssessment {
  kind: "REVISE" | "SPLIT" | "MERGE";
  bases: readonly OrganizationDefinitionRef[];
  candidates: readonly OrganizationDefinition[];
  boundaryPorts: readonly OrganizationBoundaryPort[];
  obligations: readonly OrganizationProofObligation[];
  interfaceReport?: OrganizationInterfaceReport;
  status: "admissible" | "blocked";
}
```

`status === "blocked"` whenever ANY obligation is unresolved. Evaluation is
pure with respect to canonical state: it writes nothing (F3-M01).

## 5. Explicit activation (§97–§100)

```ts
planTransformationActivation(assessment)      // refuses blocked assessments
activateOrganizationTransformation(store, assessment)
```

- Successor revisions are registered through `OrganizationStore.registerRevisions`,
  which runs ONE `BEGIN IMMEDIATE` transaction: all successors commit or none
  (§100). Split activation therefore cannot leave one lineage advanced and the
  other not (F3-M11).
- Standalone organizations use this **trusted administrative activation**. It is
  NOT institution continuation authority: an institution-governed organization
  must advance through F4/F5 governance (§98/§99). F3 implements no institution
  bypass.
- Sources are never deleted or mutated (§101); they remain historical
  artifacts (`parent` edges point at them).

## 6. Firewalls

```text
TransformationProposal ≠ canonical revision
Split = Partition + InterfaceSynthesis + InterfaceReport   (never partition alone)
BoundaryPort has NO runtime meaning (no transport/route/scheduler/authority)
Governance/adoption ≠ truth verification
Evidence claim ≠ evidence
Scheduler / runtime / effects unchanged (§103 F3-M14)
```

## 7. Machine proofs

| Proof   | Statement |
| ------- | --------- |
| F3-M01 | proposal ≠ canonical revision; evaluation writes nothing |
| F3-M02 | split partition alone insufficient |
| F3-M03 | cross-boundary interaction → paired interface ports |
| F3-M04 | every port traces to a source interaction |
| F3-M05 | no cross-boundary interaction omitted |
| F3-M06 | norm handling explicit |
| F3-M07 | role collisions explicit (merge) |
| F3-M08 | norm conflicts unresolved, not guessed |
| F3-M09 | interface report deterministic |
| F3-M10 | source definitions immutable |
| F3-M11 | split canonical activation atomic (rollback on conflict) |
| F3-M12 | merge canonical activation |
| F3-M13 | evidence claim not auto-satisfied |
| F3-M14 | scheduler/runtime unchanged |

`test/f3_transformation.test.ts`: 16 tests. Full suite: **87 files / 766 tests**.
