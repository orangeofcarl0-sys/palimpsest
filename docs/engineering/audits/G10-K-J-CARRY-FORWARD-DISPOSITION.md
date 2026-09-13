# G10-K — G10-J Carry-Forward Disposition

Inputs: `docs/engineering/audits/G10-J-CARRY-FORWARD.md`,
`G10-J-GOVERNED-EVOLUTION-DELIVERY.md`, `G10-J-GOVERNED-EVOLUTION-SPEC.md`.

```text
P0 — next-stage mandatory: none
P1 — important: CF-J-02, CF-J-03, CF-J-05
P2 — deferred / evidence-triggered: CF-J-01, CF-J-04, CF-J-06, CF-J-07, CF-J-08, CF-J-09
```

## Dispositions

### CF-J-01 — Organization-level campaign association → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Unchanged. Boundary artifacts may *reference* a Campaign (`BoundaryContentRef` kind `campaign`),
but a boundary-artifact reference is provenance/linkage, not the Organization↔Campaign
canonical association. Trigger: a real case needing `ZOMBIE…supported` or an
organization-level campaign view without a RuntimeScope basis.

### CF-J-02 — FORMALIZE_ORGANIZATION deferred → `CLOSED_IN_K`
Now executable through the G10-J path: an EXACT accepted `organization-blueprint.v1`
revision + a fresh `FORMALIZE_ORGANIZATION` Dynamics proposal + a complete formalization
candidate + `OrganizationEvolutionAdmissionPort` → `OrganizationStore` genesis (revision 0).
Machine-proved:
- accepted blueprint causes **zero** canonical organization writes (K-N25/BM-A28);
- a compiler that invents roles is rejected (K-N29/BM-A30);
- authority denial writes nothing (K-N26/BM-A31);
- no Institution / RuntimeScope / Campaign is auto-created (K-N30/K-N31/BM-A32/A33);
- a rich workspace with no FORMALIZE proposal remains federation (BM-A26).

### CF-J-03 — RuntimeScope structural kinds → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
`ENCAPSULATE_RUNTIME_SCOPE` / `COLLAPSE_RUNTIME_STRUCTURE` remain `DEFERRED_UNSUPPORTED`.
Trigger: typed structural mutation candidates with safety semantics — a dedicated
Runtime Structural Evolution stage.

### CF-J-04 — DISSOLVE / RETIRE → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Not implemented. An accepted boundary artifact may *mention* retirement but is not
retirement semantics. Trigger: a formalization/organization lifecycle requirement that
cannot be expressed without canonical retirement.

### CF-J-05 — Single-institution governance → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Unchanged; formalization is `standalone` (no institution governance for genesis, by design).
Trigger: one organization body governed across multiple institutions.

### CF-J-06 — MERGE target-id reuse → `CLOSED_IN_K` (target-id-free check added)
The formalization path verifies the target organization id has **no** current head before
genesis (K-N27/BM-A29), and the OrganizationStore genesis rules still fail closed on an
occupied id. No merge redesign was undertaken.

### CF-J-07 — Evolution store optional → `CLOSED_IN_K`
`installed.organizationEvolution` and `installed.boundaryMemory` require their stores;
without a store the surfaces are absent, never silently state-losing. `OrganizationEvolutionStore`
itself remains optional at the low-level factory (unchanged contract).

### CF-J-08 — Evidence port caller-supplied → `REQUIRED_BUT_RESCOPED_WITH_PROOF`
Carried as **CF-K-04**. Boundary acceptance satisfies no transformation evidence
obligation: the formalization path supplies no evidence port and `EVOLUTION_ASSESSED`
for `FORMALIZE` carries zero obligations; the J `evidence` port stays caller-supplied and
optional.

### CF-J-09 — Post-observation structural only → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Carried forward as CF-K-05. No success scoring, no causal attribution.

## Summary

```text
CLOSED_IN_K:                          CF-J-02, CF-J-06, CF-J-07
REQUIRED_BUT_RESCOPED_WITH_PROOF:     CF-J-08
STILL_DEFERRED_WITH_CONCRETE_TRIGGER: CF-J-01, CF-J-03, CF-J-04, CF-J-05, CF-J-09
OBSOLETE_AFTER_K_DESIGN:              none
```
No `BLOCKER_IN_K` remains.
