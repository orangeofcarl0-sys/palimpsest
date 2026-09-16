# G10-AD — Verification anti-waste audit (§30)

The stage brief §30 requires positive proof that the verification runtime did NOT
become any of seven wasteful things. Each is disproved by code structure and, where
behaviour is the claim, by a test.

```text
VerificationResult   ≠ Truth
VerificationPASS     ≠ WorkGatePASS
VerificationFAIL     ≠ TaskFAILED
VerificationResult   ≠ WorkEvidence   ≠ ProofEvidence   ≠ ProofPublication
VerificationResult   ≠ ReasoningAdmission   ≠ PromotionAuthority   ≠ EffectAuthority
ProjectVerificationStore ≠ ProjectIR ≠ WorkEventStore ≠ ProofEvidenceStore
                         ≠ OrganizationMemory
```

## 1. No universal truth engine

| Claim | Proof |
| --- | --- |
| There is no generic subject vocabulary. | `src/project_verification/artifacts.ts` defines exactly one subject kind: `PROJECT_VERIFICATION_SUBJECT_KINDS = ["CURRENT_PROJECT_HEAD"]`. There is no Reasoning-claim, Proof-claim, Campaign, Boundary, Commitment or Organization subject. |
| The result vocabulary is a protocol vocabulary, not a truth value. | `PROJECT_VERIFICATION_VERDICTS` reuses the existing validator verdicts `PASS/FAIL/SCORE/UNRESOLVED/ERROR`; `PROJECT_VERIFICATION_VERDICT_SCOPE = "named_verifier_protocol_only"` is carried on every derived status. `stateForVerdict` maps SCORE to SCORE (`status.ts:105-116`) and the plane never calls the legacy `validatorVerdictToOutcome` (which maps SCORE to PASS) — asserted statically by AD-N07b. |
| "Passed" is never upgraded in prose either. | `deriveProjectVerificationStatus` (`status.ts:286-292`) says "this is a protocol result, not truth". The web card repeats it verbatim behind `data-testid="verification-verdict-scope"`. |

## 2. No duplicate Proof verification store

| Claim | Proof |
| --- | --- |
| Proof keeps its own verification + publication admission. | `src/proof_asset/service.ts:175-176` still declares `ProofVerificationPolicyPort` and `ProofPublicationAdmissionPort`, and `decidePublication` is still a separate act. |
| The verification plane cannot reach Proof. | `src/project_verification/**` imports only `../schema/*` and `../organization_memory/artifacts.js`; the core suite asserts statically (AD-N01) that the plane matches no `proof_asset` import and never names `ProofPublication`. §27 in the integration suite re-proves the Proof seams are declared and that `git diff --name-only HEAD -- src/proof_asset` is empty. |
| A verification result is not evidence. | `test/ad_verification_runtime.test.ts` AD-N03 runs a real `SqliteProofEvidenceStore` and asserts `replay().length === 0` and `basis() === undefined` after a PASS. |

## 3. No duplicate Reasoning verification store

| Claim | Proof |
| --- | --- |
| ReasoningCell owns claim verification/admission. | `src/reasoning_cell/service.ts:99-100` still declares `verificationPolicy` + `admissionPolicy`; untouched. |
| The verification plane cannot reach Reasoning. | Same static import proof as §2 plus AD-N04 (a real `SqliteReasoningCellStore` stays at zero cells after a PASS). |
| `EXPLORE+VERIFY` does not re-verify reasoning claims. | AD-N26: the ReasoningCell admits claims through its OWN policies, and the project verification run's subject is `CURRENT_PROJECT_HEAD` — the run JSON contains no `claim`/`cell`/`branch` field. |

## 4. No OrganizationMemory experiment masquerading as Project Verify

| Claim | Proof |
| --- | --- |
| The plane imports ONE OrganizationMemory module and only vocabulary. | `src/project_verification/artifacts.ts` imports `../organization_memory/artifacts.js` for the shared verdict union (`VALIDATOR_VERDICTS`). The core suite asserts this is the ONLY organization_memory import and that it is by reference. |
| No experiment record is created. | The plane opens no OrganizationMemory store; `src/project_verification/experiment_adapter.ts` documents and performs zero store writes, and its header states that project verification history stays in the Project Verification store. |
| `verify.v1`'s capability name is honest. | Changed from `experiment.validator` to `project.verification` (`src/recipes/registry.ts`), so a recipe plan cannot claim an experiment evaluation IS project verification. |

## 5. No automatic Work Evidence bridge

| Claim | Proof |
| --- | --- |
| No Work event is emitted. | AD-N02: after a PASS the Work `EventStore` event count is unchanged and no event type matches `/VERIF/`. AD-N01/§26: the install-level dogfood compares the Work event count before/after. |
| No task or project mutation. | AD-N05/`§26 golden PASS`: `projectRow()` and `taskStates()` are byte-identical after PASS and after FAIL. |
| The management activity REFERENCES the run, never the other way around. | `src/project_management/service.ts` puts `{ kind: "project_verification", ref: runId }` in `canonicalOutcomeRefs`; AD-N19 asserts the activity record JSON contains no `verdict`/`runDigest`/`resultDigest`. |
| §25 holds at the type level. | There is no function anywhere in the plane whose parameters or return type mention an EvidenceAtom, an EvidenceItem, a publication, an admission, a task state or a promotion. |

## 6. No verifier-created Agent identity

| Claim | Proof |
| --- | --- |
| A verifier is deployment CONFIG, not an actor. | `VerifierDefinition` carries `provenance` (`provider`, `providerVersion`, `implementation`, `contextIsolation`, `model`, `promptVersion`) and NO identity, principal, actor or agent field. |
| No verifier store exists. | There is no `VerifierStore`. `ProjectVerifierRegistry` is a frozen in-memory lookup built from definitions (`src/project_verification/registry.ts`), and `verifierRegistryFromPorts` makes "registered without an executable runtime" impossible by construction. |
| No second model identity is invented. | The shipped first-party path is `project.head.git-diff-check.v1`, a MECHANICAL command protocol. The model-verifier rules exist (`classifyModelIndependence`, `effectiveModelIndependenceClass`) but no model adapter is shipped, because the host cannot establish the separation yet — recorded as `CF-AD-02`. |
| An agent cannot claim its own context is independent. | The application surface exposes exactly `status`, `history`, `verifyCurrentHead`; `verifyCurrentHead` accepts only a registered `verifierRef` and a reason, and `requestedBy` is filled by the surface. Asserted by the §22 shape test (`Object.keys(surface).sort()` equals the three names). |

## 7. No scalar trust score

| Claim | Proof |
| --- | --- |
| A score is per-protocol and never aggregated. | `VerifierDefinition` has no score. The derivation has no score, no weight and no aggregate; `score` exists only on a single `SCORE` verdict (`materializeProjectVerifierRawResult` requires it for SCORE and forbids it for PASS). |
| SCORE is never promoted to PASS. | `stateForVerdict("SCORE") === "SCORE"`; AD-N07 asserts the plane never calls the SCORE->PASS helper; AD-N07b asserts the helper's existence is irrelevant because the plane never references it. |
| The posture exposes no score. | The VERIFY row is an enum (`AVAILABLE`/`CONDITIONAL`/`PREVIEW_ONLY`/`UNAVAILABLE`) with a reason string, exactly like MONITOR. |

## 8. No Personal / External Asset scope

| Claim | Proof |
| --- | --- |
| No asset, association or library concept exists in the plane. | `src/project_verification/**` contains no `asset`, `association`, `library`, `external asset` or `personal` symbol. |
| Verification history does not enter `ProjectAssetAssociation`. | The plane never imports `src/project_workspace/**`; the install wires verification independently of the association store, and no code path calls `associateAsset` from verification. |
| §24 is satisfied by the derived view instead. | The verification history is exposed as a derived PROJECT view (`status()` + `history()`), which is why an asset association was not needed. |

## 9. Residual costs the audit does NOT hide

```text
C1  A product install now composes a verification history store by default at the
    derived operating path. That is one more SQLite file handle per install and one
    more close() in dispose(). The store is NOT closed when the embedder supplied it.
C2  `application.verification.status()` reads the canonical ProjectIR projection and
    the git head on EVERY status read (`status()` -> `repositoryHead()`), and
    `projectManagement.assess()` calls it once per read when a VERIFY preference is
    stored. A status read is therefore not free.
C3  The default first-party protocol is `git diff --check`, a bounded subprocess. A
    deployment whose repository has pre-existing whitespace errors will record FAIL
    honestly - the protocol is narrow, not a general "project is correct" check.
C4  `src/project_operating/activity.ts` gained ONE additive enum member
    (`project_verification`). It is a vocabulary addition required by §21, not a
    semantic change; no policy, decision or fold moved.
```

```text
Anti-waste verdict: no universal truth engine, no duplicate Proof or Reasoning
verification store, no experiment masquerading as project verification, no
automatic Work Evidence bridge, no verifier-created identity, no scalar trust
score, no Personal/External asset scope.
```
