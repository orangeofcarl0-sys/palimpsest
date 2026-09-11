# G10-B0 — Delivery Report

Status: **G10-B0 · BINDING SEMANTICS DESIGN · DRAFT · NOT IMPLEMENTED · NO PRODUCTION SCHEMA COMMITMENT**

Branch `experiment/g10-b0-binding-semantics-design`, from canonical `main`
(`b18b08b`). Docs-only.

## Answers (30)

1. **Were PRs #8/#10/#11 merged in order?** Yes: #8 (`b31bbd0`) → #10
   (`a3f759a`) → #11 (`b18b08b`), each rebase/retargeted onto the then-current
   `main`, each with green remote CI (documented `E2E-DEBUG-01` flake handled by
   failed-job re-runs only). See `G10-B0-CANONICAL-PUBLICATION.md`.
2. **Canonical `main` SHA after publication?** `b18b08b`
   (`b18b08b2ff075c68277bb8ac43e9027e81439c6f`).
3. **Did canonical `main` pass unit/e2e?** Yes — locally 60 files / 433 tests,
   e2e 21/21; remote run `34633661315` on `b18b08b` concluded success after one
   documented flake re-run.
4. **Is PLMP-UAS-1 now canonical on `main`?** Yes — the frozen spec is present
   with the publication-status note; PLMP-UAS-0/AGT-0/PAG-0 are untouched.
5. **Was G10-B0 branched from canonical `main`?** Yes, from `b18b08b`.
6. **Was any PAL-FED code inherited?** No — evidence by reference only; no
   `PeerRef` implementation, fabric config, `decision_submit`, admission state,
   or experiment runner.
7. **What current implementation surfaces relate to Binding?** Sixteen inventoried
   surfaces (`G10-B0-CURRENT-BINDING-INVENTORY.md`); headline: no binding concept
   exists on `main`; relevant neighbours are the Work definition lineage
   (`TaskProposal.definitionId` / `TaskSpec.definition_id`), the IR capability
   gate, runtime model attribution/advisory, the structural DSH host contract,
   host-path repository identity, worktree allocation, and scheduler purity.
8. **Final semantic definition of BindingDefinition?** Declarative binding
   intent: what logical things must be associated, the mandatory constraints and
   preferences that apply, and explicit pins to *durable* targets (continuity
   identity) where intended.
9. **Is BindingDefinition declarative or runtime state?** Declarative. It is not
   current runtime state and not a bag of provider/session IDs.
10. **Is it distinct from resolved binding?** Yes (`BIND-CAND-01`).
11. **Where does concrete binding resolution live conceptually?** In a derived,
    freshness-bound resolution associated with the derived `ExecutionPlan`,
    computed from the four RunDefinition inputs plus continuity/runtime state.
12. **Is a separate BindingResolution concept needed?** Yes — option B (distinct
    derived artifact referenced by/embedded in the plan); the semantic
    requirement is "derived, freshness-bound, replaceable without definition
    mutation". No production type.
13. **Is PersistentPoint creation part of binding resolution?** No — non-default.
    Unsatisfied binding is the safe outcome; durable-locus creation/promotion
    stays intentionally open.
14. **Can Binding explicitly target an existing PersistentPoint?** Yes — explicit
    pin to durable continuity identity is a first-class binding mode.
15. **Can Binding use constraint-based selection?** Yes — both explicit pins and
    constraint-based requirements belong in binding semantics; no matching
    algorithm is designed.
16. **Is PeerRef required by Binding?** No. Binding targets continuity identity,
    not collaboration addressing; the `PeerRef ↔ PersistentPoint` relation
    remains frozen-open and no `AgentDefinition.peerRef` shortcut is designed.
17. **Is AgentDefinition↔PersistentPoint cardinality frozen?** No — intentionally
    open (one→one, one→many, revisions→same point, unbound→resolved all remain
    possible).
18. **Is PersistentPoint↔RuntimeAgent cardinality frozen?** No — open over time;
    carrier replacement is expected and must not replace the point.
19. **Does Session identity appear in durable BindingDefinition?** No
    (`BIND-CAND-10`); sessions live in runtime attachment/derived artifacts.
20. **How are requirements separated from concrete providers?** Logical needs
    (competence, context budget, tool kind, locality) live in
    Architecture/Work/binding intent; concrete provider/model/endpoint/tool
    implementations live at resolution/RunConfiguration/runtime — matching
    today's attempt attribution and `modelCandidates` advisory.
21. **Are Competence/RuntimeFeature/AuthorityGrant preserved?** Yes; binding may
    satisfy runtime features and select competence-compatible resources but
    never converts capability into authority.
22. **Can Binding grant authority?** No (`BIND-CAND-05`); no `binding.authority`
    semantics.
23. **Does Binding imply organization membership?** No (`BIND-CAND-06`; no
    OrganizationGraph edge).
24. **Does Binding imply commitment?** No (`Assignment ≠ Commitment` preserved).
25. **Does Binding preserve Activation ≠ Attempt?** Yes; no `taskOwner`-style
    field; the Invocation/Participation zone remains the (open) link and is not
    solved through Binding.
26. **Does BindingDefinition need independent identity/revision/digest?** Yes —
    a `RunDefinition` must unambiguously identify the binding intent it was
    compiled from; new namespace, never `definition_id`.
27. **How is stale resolved binding handled semantically?** Resolution is
    freshness-bound to its declarative inputs plus the continuity/runtime
    snapshot it was resolved against; late/stale success is not a committable
    current result; rebinding replaces the resolution without mutating
    definitions or point identity.
28. **Did any production code/schema change?** No — docs-only diff
    (`docs/engineering/`).
29. **What remains intentionally open?** PeerRef↔PersistentPoint; definition↔point
    cardinality; Invocation/Participation; point creation/promotion workflow;
    PersistentPointId scheme; binding constraint/preference language and schema;
    binding/point storage backends; authority representation;
    resolution/realization API shape; typed patch families.
30. **Recommended next stage?** **A — G10-B1: Binding schema / interface
    candidate design** (semantics precede runtime realization; the candidate
    invariants and boundaries here are its input).

## Deliverables

- `docs/engineering/G10-B0-CANONICAL-PUBLICATION.md` (Stage 0 record)
- `docs/engineering/G10-B0-BINDING-SEMANTICS-DESIGN.md` (primary design)
- `docs/engineering/G10-B0-BINDING-IDENTITY-MATRIX.md`
- `docs/engineering/G10-B0-CURRENT-BINDING-INVENTORY.md`
- `docs/engineering/G10-B0-DELIVERY.md` (this file)
- `docs/engineering/README.md` + `docs/engineering/audits/G10-G11-ROADMAP.md`
  (additive updates)

## Gates

- `git diff --check` — clean; diff is `docs/engineering/` only.
- `pnpm test` — 60 files / 433 passed; `pnpm build`, `pnpm build:web` — pass;
  `pnpm test:e2e` — 21 passed (canonical `main` baseline, Playwright
  `retries = 0`).
- Remote CI recorded from the observed run on this PR; not fabricated.
