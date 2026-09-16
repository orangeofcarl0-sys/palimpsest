# G10-AD — Verification runtime assessment (AD0 mandatory audit)

Stage: **Independent Project Verification Runtime**.
Baseline audited: `02131caa3ba4631004ff049d5c66378b8fd1b9e4` (`main`).
Method: source read over the pre-stage tree. Every claim below is asserted against
a `file:line` in that tree, so a reader can re-derive it with
`git show 02131caa:<path>`; each line number is the line in the PRE-integration
file, not the current one.

```text
Audit conclusion: the VERIFY Work Mode capability had NO executable runtime.
                  It was a boolean, an ignored recipe step and an untyped
                  management stub. Every §3 claim is CONFIRMED.
```

## 1. Claim matrix

| # | Claim to prove | Verdict | Evidence (pre-integration) |
| --- | --- | --- | --- |
| A1 | The VERIFY preference has no executable runtime. | **CONFIRMED** | `src/project_operating/posture.ts:293-297` derived the VERIFY row from a single boolean, `input.capabilities.independentVerifier`. There was no verification service, store, registry or provider anywhere in `src/`. |
| A2 | Management install hardcodes `verify = false`. | **CONFIRMED** | `src/install.ts:1519` — `capabilities: { recipeExecution: recipeExecution !== undefined, verify: false }`. `capabilityAvailable("verify")` therefore always answered `false`, so a `RUN_LOCAL_VERIFY` candidate could never be permitted. |
| A3 | No `RUN_LOCAL_VERIFY` candidate is derivable. | **CONFIRMED** | `git show 02131caa:src/project_management/actions.ts \| grep -n RUN_LOCAL_VERIFY` returns nothing. Every `Draft` pushed by `deriveManagementActionCandidates` was driven by a `ProjectWorkspaceView.openLoop` kind; none of the twelve loop kinds maps to verification. The policy row existed (`src/project_management/policy.ts:67`) and the executor switch arm existed, but nothing could produce the candidate. |
| A4 | The verify seam is untyped. | **CONFIRMED** | `src/project_management/service.ts:90` — `readonly verify?: { run(): Promise<unknown> } \| undefined;`. The return value was discarded at `:580` (`await verify.run();`) and the result carried no ref (`typedReasonCode: "verify_port_ran"`, `canonicalOutcomeRefs: []` at `:582-585`). |
| A5 | Compiling FOCUS+VERIFY emits `bind_verification`. | **CONFIRMED** | `src/recipes/compiler.ts:117-124` emits `{ kind: "bind_verification", verifierRef: raw }`, defaulting to the invented token `"deterministic"` when no parameter was supplied. |
| A6 | `RecipeExecution` ignores it. | **CONFIRMED** | `git show 02131caa:src/recipes/execution.ts \| grep -c verify` → `0`. `RecipeExecutionOutcome` (`:52-64`) had four variants and no verification field; `execute()` switched on `compiled.baseMode` alone and never inspected `compiled.modifiers` or `compiled.steps`. |
| A7 | A bare `verificationCapabilityRef` can be descriptive despite no runtime. | **CONFIRMED** | `src/install.ts:371` declared the option; `:1355` passed it to the Advisor as `verifierRef`. The Advisor's only independence reasoning was a NAME heuristic, `isSameModelVerifier` (`src/advisor/advisor.ts`), and its capability token was the experiment vocabulary `CAPABILITY_VERIFIER = "experiment.validator"` (`:66`). A string produced a "verification" narrative with nothing behind it. |
| A8 | There is no durable Project Verification result/ref. | **CONFIRMED** | No `src/project_verification/**` module existed (`git show 02131caa:src/project_verification` fails). `CANONICAL_OUTCOME_KINDS` in `src/project_operating/activity.ts:58-65` had no verification kind, so no management activity could even reference a verification outcome. |

## 2. What the audit additionally observed

Beyond the eight required claims, the audit recorded three structural facts that
shaped the design:

```text
S1  There was no verification SUBJECT anywhere. Nothing materialized the exact
    current ProjectIR head as a digest-bound target; "verification" had no
    identity to bind a result to.

S2  The only verification-shaped vocabulary in the tree was the
    ExperimentValidatorPort primitives (src/experiment/validators.ts), whose
    helper `validatorVerdictToOutcome` maps SCORE -> PASS. Reusing those
    primitives therefore required an adapter that does NOT reuse that mapping.

S3  ReasoningCell and Proof already owned SEPARATE verification-policy
    semantics of their own:
      src/reasoning_cell/service.ts:99-100  verificationPolicy + admissionPolicy
      src/proof_asset/service.ts:175-176    verificationPolicy + publicationAdmission
    Both are untouched by this stage and are asserted untouched (§27).
```

## 3. Findings that are NOT defects

| Observation | Why it is not a defect |
| --- | --- |
| `verify.v1` was already `CONDITIONAL`, not `PRODUCTION_READY`. | The registry was telling the truth: no execution binding existed. The bug was elsewhere (A2/A3/A6), and the readiness value stays `CONDITIONAL` after the stage because deployment binding remains conditional. |
| `bind_verification` was descriptive only. | Compilation is by design descriptive (`src/recipes/compiler.ts:46-50`). The defect was the invented default token, not the descriptiveness. |
| The management policy row `RUN_LOCAL_VERIFY` already existed with the right cells. | The row is correct; only the capability gate (A2) made it unreachable. The matrix is preserved verbatim (§21). |
| No verifier identity / model adapter existed. | Correct: inventing a second-model identity would have been a STOP condition (§38). A first-party MECHANICAL verifier is sufficient and is what the stage ships. |

## 4. Audit-driven design consequences

```text
A1 -> §15  VERIFY availability must derive from a REAL runtime capability view
           (registry + executable providers), not a boolean.
A2 -> §16  the declared boolean is retired as an availability claim; a real typed
           seam replaces it.
A3 -> §19  a PURE, deterministic candidate builder must be able to emit
           RUN_LOCAL_VERIFY without running any verifier.
A4 -> §21  typed execution returning the canonical ref
           `project_verification:<runId>`.
A5/A6 -> §17/§18  the capability is renamed to `project.verification`, the absent
           verifier binds the EXPLICIT sentinel `project-default`, and execution
           runs the base mode and THEN verifies the current head.
A7 -> §16/§28  the Advisor fact derives from the runtime/registry.
A8 -> §12/§21  a narrowly-owned append-only history store plus a new canonical
           outcome kind so a management activity can REFERENCE a run.
S1 -> §4/§5   a ProjectHeadVerificationSource materialized from the canonical
           ProjectIR projection + a repository-consistency check.
S2 -> §9      an adapter over the validator primitives that never maps SCORE->PASS.
S3 -> §27     the ReasoningCell/Proof policy seams are proven unmodified.
```

## 5. Honest limitations of this audit

1. The audit is a **source** audit. It proves the absence of an executable
   verification path from the tree, not from a running deployment: a host could
   always have implemented verification outside this repository and passed it in
   through an undocumented seam. No such seam existed in the public install
   options, which is what the audit asserts.
2. Claims A2/A3/A4/A6 are asserted at the FIRST-PARTY composition
   (`installPalimpsest`, `deriveManagementActionCandidates`, the management
   service, the recipe execution service). An embedder that constructs
   `makeProjectManagementService` by hand could have supplied its own `verify`
   port; the point is that the PRODUCT path had none, and that the port could not
   produce a durable ref even if it existed.
3. The audit did not attempt to measure how often the dead path was hit in
   practice. It could not be hit at all through the shipped surfaces.
