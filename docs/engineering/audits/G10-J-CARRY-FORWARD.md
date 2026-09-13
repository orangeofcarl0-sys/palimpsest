# G10-J CARRY-FORWARD Register

Mandatory input for the next stage. No `BLOCKER_IN_J` remains.

## CF-J-01 — Organization-level campaign association absent
- **ID:** CF-J-01 · **Observed at:** `organization_dynamics/service.ts` (campaign associations come from scope history)
- **Evidence:** associated campaign ids are read from RuntimeScope `campaignIds`; an organization with no runtime scope therefore has no observable campaign association, so `ZOMBIE...supported` is structurally unreachable in J.
- **Category:** ORGANIZATION_DYNAMICS · **Why not in J:** would require an organization↔campaign association artifact, beyond the frozen H association.
- **Semantic impact:** zombie stays `unresolved` without an associated campaign; never guessed.
- **Recommended next stage:** Boundary Memory / Organization Dynamics. · **Blocking status:** NON_BLOCKING

## CF-J-02 — FORMALIZE_ORGANIZATION deferred
- **ID:** CF-J-02 · **Category:** GENERALIZED_WORK · **Evidence:** Dynamics proposals lack full mission/role/norm/assignment structure; peer sets must never auto-formalize.
- **Recommended next stage:** a formalization-authoring stage. · **Blocking status:** NEXT_STAGE_REQUIRED

## CF-J-03 — RuntimeScope structural kinds deferred
- **ID:** CF-J-03 · **Evidence:** `ENCAPSULATE_RUNTIME_SCOPE` / `COLLAPSE_RUNTIME_STRUCTURE` have no typed structural mutation candidate or safety semantics.
- **Category:** RUNTIME_POLICY · **Recommended next stage:** Runtime Structural Evolution. · **Blocking status:** NEXT_STAGE_REQUIRED

## CF-J-04 — DISSOLVE_OR_RETIRE deferred
- **ID:** CF-J-04 · **Category:** ORGANIZATION_DYNAMICS · **Blocking status:** NEXT_STAGE_REQUIRED (needs org retirement semantics).

## CF-J-05 — Single-institution governance
- **ID:** CF-J-05 · **Evidence:** J supports one explicitly wired institution; multi-institution adoption of one organization revision is unresolved by design.
- **Category:** AUTHORITY · **Recommended next stage:** multi-institution governance. · **Blocking status:** NEXT_STAGE_REQUIRED

## CF-J-06 — MERGE target-id reuse not deeply verified
- **ID:** CF-J-06 · **Category:** ORGANIZATION_DYNAMICS · **Blocking status:** NON_BLOCKING (store genesis rules fail closed).

## CF-J-07 — Evolution store optional
- **ID:** CF-J-07 · **Evidence:** without a store the service operates statelessly and loses continuity.
- **Category:** OTHER · **Blocking status:** NON_BLOCKING (install surface requires the store).

## CF-J-08 — Evidence port caller-supplied
- **ID:** CF-J-08 · **Category:** OTHER · **Blocking status:** NON_BLOCKING.

## CF-J-09 — Post-observation is structural only
- **ID:** CF-J-09 · **Evidence:** before/after snapshot digests only; no success scoring or causal attribution.
- **Category:** ORGANIZATION_DYNAMICS · **Blocking status:** NON_BLOCKING (empirical stage).

---

```text
P0 — next-stage mandatory: none
P1 — important: CF-J-02, CF-J-03, CF-J-05
P2 — deferred / evidence-triggered: CF-J-01, CF-J-04, CF-J-06, CF-J-07, CF-J-08, CF-J-09
```
