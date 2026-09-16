# G10-AD — Verification runtime campaign

Campaign record for the stage that made VERIFY a real project capability. This is a
journal of what was decided, in what order, and on what evidence — not a second
specification. The requirements live in `G10-AD-VERIFICATION-SPEC.md`.

Baseline: `02131caa3ba4631004ff049d5c66378b8fd1b9e4`.
Branch: `experiment/g10-ad-verification`.

```text
Campaign shape: one narrow product capability, delivered in two passes -
  PASS 1 (core plane)  src/project_verification/** + test/ad_verification_runtime.test.ts
  PASS 2 (integration) posture, recipes, management, surfaces, web, e2e, docs
```

## 1. Entry state

```text
FOCUS / EXPLORE / COORDINATE   had real runtime semantics
MONITOR                        had a real runtime (closed in G10-AC-R)
VERIFY                         was a boolean, an ignored recipe step and an
                               untyped management stub
```

The entry verdict was PARTIAL for VERIFY alone. The AD0 audit
(`G10-AD-VERIFICATION-RUNTIME-ASSESSMENT.md`) confirmed all eight §3 claims before
any code was written.

## 2. Decisions taken (and the alternatives rejected)

| Decision | Rejected alternative | Why |
| --- | --- | --- |
| The subject is the CURRENT ProjectIR head, materialized from the canonical projection. | A caller-supplied revision/commit, or a generic "verify this artifact" subject. | A caller-supplied target makes "the project is verified" unfalsifiable; a generic subject collapses Reasoning/Proof/Boundary semantics into one plane (a §38 STOP condition). |
| A first-party MECHANICAL verifier ships; no model verifier. | A model adapter with a declared independence class. | The host cannot establish a real provider boundary, so a model adapter would be `UNKNOWN`/`DECLARED_SEPARATE` at best. Inventing a second-model identity is a §38 STOP condition. |
| Independence is a five-class product model with explicit separation contracts. | A boolean `independent: true`, or a "different model ⇒ independent" convention. | A boolean cannot distinguish an established separation from a declaration, and different model/prompt is not separation. |
| `EXTERNALLY_SEPARATED` counts only with an explicit contract. | Counting the class token alone. | §10 says "may count if its contract is explicit"; a bare token is not a contract. |
| The history store is narrowly owned and append-only, with per-project chain digests. | Reusing the Work EventStore, or reusing OrganizationMemory experiments. | Both would have made a verification result Work Evidence or an experiment record (forbidden by §2/§25/§30). |
| Freshness is a DERIVATION over (revision, digest, head commit, definition digest). | Deleting or rewriting an old run, or a stored `stale` flag. | §13: an old run must become stale by derivation, and the history must never be rewritten. |
| The recipe compiler binds the EXPLICIT sentinel `project-default` for an absent verifier. | Keeping the invented token `deterministic`, or omitting the step. | §17: an absent verifier must never be SILENTLY bound. `project-default` names the deployment default and is resolved (or refused) by the runtime. |
| Management derives the automatic candidate from a PURE context thunk. | Letting the candidate builder run a verifier, or letting management read the verification store directly. | §19 requires a pure builder that runs no verifier; management must not own the verification store. |
| The activity REFERENCES the run; the kind union gained one member. | Copying the verdict into the activity record, or storing a free-text ref. | §21 requires a reference. A free-text ref would be flagged incomplete by the derived operating history. |
| The verification availability view is declared STRUCTURALLY in `project_operating`. | Importing `src/project_verification/**` from `project_operating`. | Same direction-of-dependency reasoning as `MonitorRuntimeCapabilityView`: it keeps the operating posture free of a product-plane dependency and gives ONE availability table. |
| A PRODUCT install composes the default runtime; a BARE Work install does not. | Composing the runtime for every install. | A bare Work-only install must stay byte-identical (nine tools, no advanced routes) for the AC-R/P regression; a product install needs a real VERIFY path without host code. |

## 3. Order of work

```text
1  AD0 audit                                        (no code)
2  artifacts / independence / registry / provider    (the plane's vocabulary)
3  store / status / service                          (durability + derivation)
4  experiment_adapter                                (the first-party mechanical path)
5  test/ad_verification_runtime.test.ts              (37 core proofs; plane frozen)
6  work_mode_profile / posture                       (§15/§16 availability)
7  recipes registry / compiler / execution           (§17/§18)
8  project_management actions / service              (§19/§20/§21)
9  advisor                                            (§28)
10 application surface / http / tools                 (§22/§23)
11 install wiring                                     (§29 + the live hand-over)
12 web api + VerificationPanel + e2e                  (§23)
13 test/ad_verification_integration.test.ts           (§15…§28, AD-N17…N30)
14 docs + gates
```

## 4. Incidents and corrections

| Incident | Resolution |
| --- | --- |
| The core pass found a real durability gap: `appendStart` digested a RAW timestamp while the reader normalized it, so a legal ISO-8601 start timestamp could be persisted but never read back. | Fixed inside the plane and pinned by AD-N29b with an in-file explanation. Reported here because it was found by the plane's own suite, not by review. |
| The V-campaign source firewall (V-N01) rejected the new `../project_verification/` import from `project_management/service.ts`. | The allow-list gained ONE entry with an in-file justification: the admitted module is the same class of narrowly-owned, non-authoritative product plane as the already-admitted `project_operating`, and none of the FORBIDDEN patterns matches it. The firewall's real invariant is unchanged and still asserted. |
| `src/project_operating/activity.ts` (outside the integration write scope) needed one additive enum member for §21. | Added `"project_verification"` to `CANONICAL_OUTCOME_KINDS` only, with a comment. No policy, decision or fold changed. Recorded as a deliberate scope extension. |
| The management verify seam had to be handed to services composed BEFORE the verification runtime. | The install uses a mutable wiring holder (`verificationWiring`), the SAME pattern the monitor uses, so every reader resolves the runtime at call time and `undefined` means honestly "no runtime". |
| The bare `independentVerifier: true` assertion in `test/ab_operating_posture.test.ts` asserted `AVAILABLE`. | Updated to `CONDITIONAL` with an in-file justification, and the test gained the REAL AVAILABLE path (a capability view) plus the shared-context UNAVAILABLE path, so coverage increased rather than decreased. |
| The Adviser's `isSameModelVerifier` name heuristic became unused. | Kept as an explicitly deprecated, non-consulted helper (re-exported as `verifierRefNameLooksSameModel`) so no embedder breaks; the rationale now uses the runtime fact. |

## 5. What this campaign did NOT do

```text
no second head truth
no verifier store (config registry only)
no model verifier
no automatic Work Evidence / Proof / Reasoning bridge
no change to the management policy matrix
no ReasoningCell / Proof / Work / promotion change
no asset association for verification history
no CLI verification command (recorded as CF-AD-03)
no subject kind beyond the current project head (recorded as CF-AD-01)
```

## 6. Exit state

```text
VERIFY is reachable, executable, provenance-carrying and durable.
Its availability is derived from a real runtime.
Its result grants nothing.
```
