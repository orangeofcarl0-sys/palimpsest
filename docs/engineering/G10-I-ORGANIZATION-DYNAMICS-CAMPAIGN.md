# G10-I — Organization Dynamics: Observation, Diagnosis & Structural Proposal

Baseline: `main @ b59fe586ecc04e6086eae3a8aabbc46a332a8b3d`. Frozen: UAS-1, BIND-1, AGT-0, PAG-0, G10-H RuntimeScope/Holon spec.

```text
Observed Runtime / Collaboration / Organization History
   → Grounded Structural Snapshot → Structural Diagnosis → Structural Proposal
Observation ≠ Diagnosis ≠ Proposal ≠ Transformation ≠ Governance ≠ Activation
```

The dynamics layer observes, diagnoses, and proposes — it has **zero canonical mutation
authority** and never activates a structural change.

## 1. I0 decisions
See [`audits/G10-I-ORGANIZATION-DYNAMICS-ASSESSMENT.md`](audits/G10-I-ORGANIZATION-DYNAMICS-ASSESSMENT.md):
no canonical Dynamics store (derived snapshot + digest proposal); subject is a tagged union of
existing refs; multi-store optimistic-reread basis; mechanical metrics only; hysteresis via
multi-basis snapshots + explicit `DynamicsPolicy`.

## 2. H carry-forward disposition
All 12 items adjudicated ([disposition](audits/G10-I-H-CARRY-FORWARD-DISPOSITION.md)).
`CF-H-03/06/08/09` are **CLOSED_IN_I**; CF-H-10 is OBSOLETE_AFTER_I_DESIGN; the rest are
STILL_DEFERRED with concrete triggers.

## 3. Implemented artifacts
| Artifact | Purpose |
|---|---|
| `src/runtime_scope/artifacts.ts` | tagged, verifiable `RuntimeScopeBoundarySource`; `CAMPAIGN_ASSOCIATED`/`CAMPAIGN_DISASSOCIATED` events |
| `src/runtime_scope/service.ts` | boundary-source verification, representation admission, campaign association |
| `src/organization_dynamics/dynamics.ts` | subject/basis/policy/snapshot/diagnostics/proposal/advisor artifacts + strict parsers |
| `src/organization_dynamics/service.ts` | observe / diagnose / persist / propose / evaluateProposal / proposalImpact |
| `src/install.ts` | `installed.organizationDynamics?` + mechanical coordination observation adapter |
| `src/advanced.ts` | advanced-only dynamics export |

## 4. Canonical truth ownership
Dynamics owns **no** store. Canonical truth stays in Organization / RuntimeScope / Coordination
/ Campaign stores; proposals are non-canonical, digest-identified. No duplicate semantic truth.

## 5. Multi-store consistency
Optimistic read: bases → data → re-read bases; if any base changed → `observation_raced`,
else accept with `synchronization: "optimistic_reread"`. Never claimed atomic.

## 6. Snapshot schema/semantics
`OrganizationDynamicsSnapshot` — derived, immutable, deep-frozen, deterministic, basis-bound,
restart-reproducible, strictly parsed. Digest covers subject + basis + policy + normalized
facts; excludes wall-clock/presentation/caller labels.

## 7. Mechanical metrics
`RuntimeStructuralSnapshot`: scope count, max depth, activation/child member counts, member
additions/removals, reconfiguration count, boundary/peer change counts, campaign associations,
external boundary/peer presence, organization-basis freshness — all from canonical history.

## 8. Known / unknown discipline
`known | unknown | error` per family; a missing source is `unknown`, never `empty`. Any
diagnostic depending on an unknown input is `unresolved`.

## 9. Diagnostic families
`STALE_ORGANIZATION_GROUNDING`, `RUNTIME_RECONFIGURATION_CHURN`,
`DECLARED_BUT_UNOBSERVED_INTERACTION`, `UNDECLARED_OBSERVED_INTERACTION`,
`STABLE_FEDERATION`, `INTERACTION_CONCENTRATION`, `SHADOW_ORGANIZATION_CANDIDATE`,
`ZOMBIE_ORGANIZATION_CANDIDATE`, `MERGE_PRESSURE`, `SPLIT_PRESSURE`,
`ENCAPSULATION_CANDIDATE`.

## 10. Pressure representation
A **vector**, never one score. Each pressure carries `standing ∈ {supported, unsupported,
unresolved}` + `evidence` + `counterEvidence` + `unknowns`. Multiple pressures may be
supported simultaneously.

## 11. Interface compressibility
`InterfaceCompressibilityAssessment` reports observable evidence (boundary exists/stable,
internal reconfiguration high, external representation stable) and `semanticSufficiency:
"requires_evidence"` — never a fabricated ratio.

## 12. Hysteresis / DynamicsPolicy
Explicit, versioned, provenance-recorded `DynamicsPolicy` (min distinct bases + explicit
thresholds). A single snapshot may never claim persistent/stable/shadow/zombie; persistence
requires ≥ `minDistinctBases` distinct basis-separated snapshots.

## 13. Stable federation proof
Recurring collaboration across ≥2 distinct peers that meets the policy thresholds yields
`STABLE_FEDERATION: supported` (federation is a valid stable form); `RETAIN_FEDERATION` is a
first-class proposal kind. Recurring collaboration never auto-creates an Organization.

## 14. Shadow / drift / zombie semantics
Shadow = candidate only, requires hysteresis. Drift identifies exact declared/observed
divergence (no "wrong" verdict). Zombie requires all relevant observations known and
explicitly notes "campaign activity not observable — dormant ≠ dead" → `unresolved`.

## 15. Proposal semantics & identity
`OrganizationDynamicsProposal` — non-canonical, immutable, strict, basis-bound,
diagnostic-bound, digest identity (no durable ProposalId store).

## 16. Freshness
`evaluateDynamicsProposalFreshness` (one shared read-only evaluator): a changed load-bearing
source basis makes the proposal `stale`.

## 17. Impact & independence loss
`ProposalImpactReport`: affected scopes/boundaries/peers, independence-loss dimensions
(distinct peers/organizations/commitments observable; authority/evidence/failure/workspace =
`unknown`), and `maps_to_existing_transformation` (REVISE/SPLIT/MERGE/unsupported).

## 18. Zero mutation authority
Source firewall: the dynamics module imports no canonical mutator and defines no
`applyProposal`/`activateProposal`/`mergeNow`/`splitNow`. Branch E2E asserts Organization,
RuntimeScope, and Campaign histories are unchanged by observe/diagnose/propose.

## 19. Golden E2E
`test/i_dynamics_e2e.test.ts` §44: org → scope → members → verified boundary → campaign
association → collaboration → S1 → reconfiguration → S2 → metrics/diagnostics → proposal →
impact → stale → restart reconstruction → no auto-transformation. Plus the stable-federation
outcome and negatives I-N01…I-N25.

## 20. Test / CI matrix
`git diff --check` · dynamics tests (10 + 7) · `pnpm test` (113 files / 970 tests) ·
`pnpm build` · `pnpm build:web` · `pnpm test:e2e` (21/21). Details in the
[delivery record](audits/G10-I-ORGANIZATION-DYNAMICS-DELIVERY.md).

## 21. Carry-forward
[`audits/G10-I-CARRY-FORWARD.md`](audits/G10-I-CARRY-FORWARD.md).

## 22. Final verdict

```text
G10-I ORGANIZATION DYNAMICS:
OBSERVATION, DIAGNOSIS & STRUCTURAL PROPOSAL — PASS
```

## 23. Canonical gate record
Remote CI run `34777564467` (attempt 1) SUCCESS on the exact merged HEAD `0020e14`;
PR `#58` -> `bd7ce48`; canonical main: 113 files / 970 tests, build, build:web, e2e 21/21.

## 24. Recommended next stage
`G10-J — Governed Dynamic Evolution` (not started): map a fresh `DynamicsProposal` into the
existing OrganizationTransformation/Governance path with proof obligations and explicit
activation. It must read this campaign, the delivery record, and the carry-forward register.

---

```text
G10-I ORGANIZATION DYNAMICS:
OBSERVATION, DIAGNOSIS & STRUCTURAL PROPOSAL — PASS
```
