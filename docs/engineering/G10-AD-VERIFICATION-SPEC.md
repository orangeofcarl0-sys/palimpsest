# G10-AD — Independent Project Verification runtime specification

Stage: **Independent Project Verification Runtime** — verify the exact current
ProjectIR head under a named, registered, versioned verifier protocol and remember
the result, without ever turning "a verifier passed" into truth or authority.
Baseline: `02131caa3ba4631004ff049d5c66378b8fd1b9e4`.
Audit: `G10-AD-VERIFICATION-RUNTIME-ASSESSMENT.md` (all eight §3 claims CONFIRMED).
Deliverables: the ten documents listed in §34, plus the `src/project_verification/**`
plane (proven by `test/ad_verification_runtime.test.ts`) and the integration
(proven by `test/ad_verification_integration.test.ts`).

```text
This stage is NOT: a universal Truth engine, a ReasoningCell replacement, a
Proof/Evidence replacement, an automatic Work gate authority, an External Asset
Library.
```

## 1. Firewalls (unchanged and re-asserted)

```text
VerificationResult != Truth
VerificationPASS != WorkGatePASS
VerificationFAIL != TaskFAILED
VerificationResult != WorkEvidence
VerificationResult != ProofEvidence
VerificationResult != ProofPublication
VerificationResult != ReasoningAdmission
VerificationResult != PromotionAuthority
VerificationResult != EffectAuthority

VerifierIndependence != VerifierCorrectness
DifferentModel != AutomaticallyIndependent
DifferentPrompt != Independent
FreshContext != Truth
SameModelSameContext != Independent

ProjectVerificationStore != ProjectIR
ProjectVerificationStore != WorkEventStore
ProjectVerificationStore != ProofEvidenceStore
ProjectVerificationStore != OrganizationMemory
```

## 2. Requirement disposition (§-by-§)

| § | Requirement | Delivered as | Guarded by |
| --- | --- | --- | --- |
| §1 | v1 subject is `CURRENT_PROJECT_HEAD` only | `PROJECT_VERIFICATION_SUBJECT_KINDS` has one member | AD-N08, anti-waste §1 |
| §4 | subject materialized from the canonical projection, never supplied | `firstPartyProjectHeadVerificationSource` over `readCanonicalProjectIr` | AD-N08/N09, §22 derivation |
| §5 | repository consistency before execution; mid-run drift → `STALE_INPUT` | service guard + `freshnessAfterRun` | AD-N10/N11, §18 blocked case |
| §6 | `VerifierDefinition` + `ProjectVerifierRegistry`, no VerifierStore | registry.ts (frozen lookup) | anti-waste §6 |
| §7 | host-neutral `ProjectVerifierPort` | provider.ts | core suite |
| §8 | `PASS/FAIL/SCORE/UNRESOLVED/ERROR`, `ERROR != FAIL`, `SCORE != PASS` | artifacts.ts + `stateForVerdict` | AD-N06/N07/N07b |
| §9 | reuse the validator primitives through an adapter | experiment_adapter.ts (never calls the SCORE→PASS helper) | AD-N07b, core suite |
| §10 | five independence classes, explicit contracts, model rules | independence.ts | AD-N13/N14/N15/N16 |
| §11 | strict `ProjectVerificationRequest` | artifacts.ts | core suite |
| §12 | durable append-only `SqliteProjectVerificationStore`, crash-honest | store.ts | AD-N28/N29, §26 restart |
| §13 | derived `ProjectVerificationStatus` + freshness binding | status.ts | §15/§22 tests |
| §14 | at least one REAL independent path | `project.head.git-diff-check.v1` (bounded subprocess) | AD-N16, dogfood evidence |
| §15 | Work Mode VERIFY availability from a real runtime | `VerificationRuntimeCapabilityView` + `verificationAvailabilityOf` | §15 tests (posture + install) |
| §16 | retire fake capability inflation | bare bool/ref no longer makes VERIFY AVAILABLE; the Advisor reads the runtime | AD-N17, §28 |
| §17 | `verify.v1` CONDITIONAL; capability renamed; honest `bind_verification` | `project.verification`; `project-default` sentinel | §17 tests |
| §18 | RecipeExecution executes VERIFY after the base mode | `verifyProjectHead` in execution.ts | AD-N24/N25/N26/N27 |
| §19 | management reachability via a PURE builder | `ManagementVerificationContext` + builder arm | AD-N18/N20/N21 |
| §20 | no verification loop | `verificationIsDue` + fresh-run suppression | AD-N19 |
| §21 | policy matrix unchanged; typed execution; durable ref | policy.ts untouched; typed seam; `project_verification:<runId>` | AD-N22/N23 |
| §22 | `application.verification.status/history/verifyCurrentHead` | surface.ts | §22 tests |
| §23 | HTTP routes + Workspace card with no generic badge | http.ts + VerificationPanel | §23 tests, E2E-PROJECT-04 |
| §24 | history as a derived project view, no asset association | derived reads only | anti-waste §8 |
| §25 | no authority bridges | typed surface has no such member | AD-N01…N05, anti-waste §5 |
| §26 | golden proofs | core suite + install-level proofs | AD-N01…N16, §26 |
| §27 | other planes unchanged | source-level `git diff` proof + seam assertions | §27 tests |
| §28 | Advisor read-only, fact from the runtime | lazy capability getters in install.ts | §28 tests |
| §29 | install shape + a default store for a durable runtime | `InstalledVerification` + composition gate | install tests |
| §30 | anti-waste | anti-waste audit | the audit itself |

## 3. Machine invariants (VER-A01…A32)

```text
VER-A01 subject = exact current ProjectIR head
VER-A02 ProjectIR remains project truth owner
VER-A03 repo-head mismatch blocks first-party verification
VER-A04 verification history append-only
VER-A05 lifecycle distinct from verdict
VER-A06 PASS != truth
VER-A07 PASS != Work Gate PASS
VER-A08 FAIL != Task FAILED
VER-A09 ERROR != FAIL
VER-A10 SCORE != PASS
VER-A11 independence explicit/provenanced
VER-A12 same-model same-context != independent
VER-A13 unknown independence != independent
VER-A14 verifier protocol versioned/digest-bound
VER-A15 freshness includes verifier-definition digest
VER-A16 head change stales old verification by derivation
VER-A17 no Work Evidence emission
VER-A18 no Proof Evidence emission
VER-A19 no Reasoning admission
VER-A20 no effect authority
VER-A21 RUN_LOCAL_VERIFY reachable only with real runtime
VER-A22 VERIFY preference gates automatic candidate
VER-A23 fresh run prevents auto-loop
VER-A24 explicit retry possible
VER-A25 bind_verification executes real runtime
VER-A26 durable run ref returned
VER-A27 management activity references run
VER-A28 advisor derives capability from runtime
VER-A29 no bare-string capability inflation
VER-A30 no universal verifier store
VER-A31 full regression green
VER-A32 CI green
```

## 4. Adversarial suite map (AD-N01…AD-N30)

| ID | Where proven |
| --- | --- |
| AD-N01 VerificationResult != Truth | core suite |
| AD-N02 PASS creates no Work Evidence | core suite |
| AD-N03 PASS creates no Proof publication | core suite |
| AD-N04 PASS creates no Reasoning admission | core suite |
| AD-N05 FAIL does not fail task/project | core suite |
| AD-N06 ERROR != FAIL | core suite |
| AD-N07 SCORE != PASS | core suite |
| AD-N08 subject derived from ProjectIR | core + integration |
| AD-N09 caller cannot verify arbitrary commit | core + §23 (HTTP injection) |
| AD-N10 Git/ProjectIR mismatch blocks provider | core + §18 |
| AD-N11 mid-run head change → STALE_INPUT | core suite |
| AD-N12 verifier definition change stales old run | core suite |
| AD-N13 same-model same-context is not independent | core suite |
| AD-N14 different prompt alone is not independent | core suite |
| AD-N15 UNKNOWN does not activate VERIFY | core suite |
| AD-N16 mechanical verifier counts as independent | core + integration |
| AD-N17 bare verificationCapabilityRef no longer inflates capability | integration |
| AD-N18 VERIFY absent creates no automatic candidate | integration |
| AD-N19 fresh completed run creates no repeat candidate | integration |
| AD-N20 new head creates verification-due candidate | integration |
| AD-N21 RUN_LOCAL_VERIFY reachable | integration |
| AD-N22 DIRECT still explicit | integration |
| AD-N23 MANAGE/DELEGATE use the existing policy; run ref durable | integration |
| AD-N24 RecipeExecution executes bind_verification | integration |
| AD-N25 FOCUS+VERIFY uses the real runtime | integration |
| AD-N26 EXPLORE+VERIFY does not re-verify reasoning claims | integration |
| AD-N27 COORDINATE+VERIFY accepts no commitment | integration |
| AD-N28 restart restores verification status | core + integration |
| AD-N29 crash never fabricates result | core suite |
| AD-N30 AC-R/W/X/Y/Z/AA/AB regressions green | the campaign suites in the same run + integration sentinels |

## 5. Gates (§35)

```text
git diff --check
pnpm build
pnpm exec vitest run --maxWorkers=2
pnpm run build:web
pnpm exec playwright test
node scripts/verification/mechanical-verify.mjs
```

Plus the exercised scenarios: real mechanical dogfood, head mismatch, mid-run
stale input, PASS/FAIL/ERROR/SCORE semantics, Work Mode VERIFY availability,
`RUN_LOCAL_VERIFY` E2E, FOCUS+VERIFY recipe E2E, restart/crash history, no
Evidence/Proof/Reasoning leakage, and the AC-R regression.

## 6. PARTIAL / STOP conditions

None of the §37 PARTIAL conditions holds after this stage:

```text
VERIFY is NOT driven by a bare bool/string           -> §15/§16/AD-N17
same-model same-context canNOT claim independent     -> AD-N13, §10
RUN_LOCAL_VERIFY is reachable                        -> AD-N21/N23
management verify HAS a durable ref                  -> AD-N23
RecipeExecution NO LONGER ignores bind_verification  -> AD-N24/N25
SCORE does NOT become PASS                           -> AD-N07
PASS does NOT become Work Evidence                   -> AD-N02
history is NOT lost on restart                       -> AD-N28 + §26
a caller canNOT verify an arbitrary commit           -> AD-N09 + §23
```

None of the §38 STOP conditions was reached: a meaningful project-verify subject
exists without collapsing Reasoning/Proof/Work semantics; independence needs no
fake second model; durability needed no Work Evidence; VERIFY needed no effect
authority; the current head materializes consistently; and `main` did not
invalidate the baseline.
