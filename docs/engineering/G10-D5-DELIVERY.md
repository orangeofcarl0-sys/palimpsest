# G10-D5 — Delivery Report

Status: **G10-D5 · ADVANCED RUNTIME INTEGRATION + CAMPAIGN CLOSE · PASS**

Branch `experiment/g10-d5-advanced-runtime-integration`, from post-D4
canonical `main` `5d8202d85c724fb02e48ea1c97702ae3d6f85178` (PR #24 merged
normally). Merged normally at stage close.

## Key answers

1. **Install surface (§92)?** Additive options: `runtimeCarrierPort`,
   `runtimeObservationPort`, `continuityStore`, `allocateActivationId`,
   `allocateSnapshotId`. When supplied, `installed.runtime` exposes the
   high-level service: `observe` / `compile` (present iff observation wiring)
   and `realize` / `release` (present iff a carrier port). Coherence is
   structural — operations lacking their wiring are absent, never stubbed.
2. **Backward compatibility (§93)?** Proven: with no runtime options,
   `installed.runtime` is `undefined` and the tool surface (9 tools) and
   controller behave exactly as before — machine-tested, plus the whole
   pre-existing suite green.
3. **Golden path vs low-level seams (§95)?** The runtime/continuity surface
   is exported from **`palimpsest-dsh/advanced` only** — the root
   contract-core export intentionally stays free of runtime mutators (static
   audit). `installed.runtime` is the golden path; kernel helpers remain for
   framework authors, documented as not-the-production API.
4. **Activation ↔ Attempt (§96)?** `OPEN — NO CANONICAL PARTICIPATION
   SOURCE`. Nothing invented; scheduler, claim path, and AttemptExecutor
   untouched (§97); the runtime service is not an authority root (§98).
5. **Campaign-wide reviews?** All completed and recorded in the umbrella:
   identity matrix (§99), effect authority (§100), persistence (§101),
   observation (§102), trust (§103), immutability (§104), failure semantics
   (§105), abort/cancellation (§106 — honestly deferred with the concrete
   host adapter), idempotency (§107), restart (§108), DSH honesty (§109 —
   `DSH CONCRETE RUNTIME ADAPTER: DEFERRED — CURRENT PUBLIC/STRUCTURAL HOST
   CONTRACT DOES NOT EXPOSE AGENT/SESSION REALIZATION`).
6. **Source scope?** Modified: `src/install.ts` (additive options + runtime
   service), `src/advanced.ts` (additive runtime/continuity exports),
   `test/runtime_realization.test.ts` (compatibility audit updated to the
   D5 state). New: `test/advanced_runtime.test.ts`, campaign umbrella,
   delivery. Untouched: scheduler, state, binding kernel, run, continuity,
   frozen contracts.
7. **Gates?** Full unit **76 files / 655 tests** (post-D4 baseline 75/652);
   builds pass; `git diff --check` clean; local e2e 21/21 (after three
   documented flake-family runs under local load); remote CI on the actual
   final HEAD recorded below / in the PR description.

## Verdict

```text
G10-D5 ADVANCED RUNTIME INTEGRATION: COMPLETE
```

Campaign verdict and canonical gates: `G10-D-RUNTIME-CONTINUITY-CAMPAIGN.md`
(§13). Per §125, the next campaign (G10-E) is NOT started.
