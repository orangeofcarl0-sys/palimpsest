# G10-S Carry-Forward Register

Mandatory input for the next stage. No `BLOCKER_IN_S`.

## CF-S-01 — No mode-selector onboarding panel
- **Observed at:** web surface (MultiGraph already labelled a debugger)
- **Evidence:** the recipe/advisor product surface is complete as tools + HTTP + application surfaces,
  but no first-layer "Mode: Focus / Explore / Coordinate + Options + Why this mode?" panel was built.
  MultiGraph carries debugger wording and no UI exposes agent count.
- **Category:** UX · **Trigger:** a user-facing onboarding pass. · **Blocking:** NON_BLOCKING

## CF-S-02 — VERIFY independence not wired by default
- **Evidence:** deterministic validators exist; independent-model/human verifiers are adapters only, and
  same-model verification is labelled not independent. `verificationCapabilityRef` gates the suggestion.
- **Trigger:** a configured independent verifier. · **Blocking:** NON_BLOCKING

## CF-S-03 — MONITOR has no production condition source
- **Evidence:** Campaign/watchers exist but wake is caller-driven; MONITOR is `PREVIEW_ONLY`. ·
  **Trigger:** a background condition source / host-wake binding. · **Blocking:** NON_BLOCKING

## CF-S-04 — EXPLORE quality transfer unknown
- **Evidence:** the real Explore E2E proves execution/verification/admission without durable agents, but
  R had no ReasoningCell quality validator, so quality transfer is `INSUFFICIENT_EMPIRICAL_EVIDENCE`.
- **Trigger:** a decomposable task with a deterministic quality validator. · **Blocking:** NON_BLOCKING

## CF-S-05 — R empirical limits persist
- CF-R-03 (single provider), CF-R-04 (validator-limited quality), CF-R-07 (n=3) remain and are surfaced
  as mandatory transferability warnings; S does not pretend to have solved them. · **Blocking:** NON_BLOCKING

## CF-S-06 — Recipe catalog is intentionally tiny
- **Evidence:** five recipes only; a broader catalog would need genuine readiness and evidence per entry. ·
  **Trigger:** a demonstrated recipe-shaped need. · **Blocking:** NON_BLOCKING

## CF-S-07 — Advisor has no learned retriever
- **Evidence:** transferability uses deterministic metadata matching only (no embeddings/learned
  recommender), by design. · **Trigger:** evidence that deterministic matching is insufficient. · **Blocking:** NON_BLOCKING

## CF-S-08 — Proof-asset bridge not implemented
- **Evidence:** `ReasoningCell` accepted claim → Evidence/proof-asset publication remains absent; the
  next stage (G10-T) is expected to give it a real product trigger. · **Blocking:** NON_BLOCKING

```text
No BLOCKER_IN_S. Next direction (spec §63): G10-T — Proof Asset Layer & Personal Data Proof Vault
(raw source → candidate claims → verification → explicit proof-asset publication → provenance/dependency/
freshness → purpose-specific selective disclosure).
```
