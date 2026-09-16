# G10-AD — Verification delivery report

Stage: **Independent Project Verification Runtime**.
Baseline: `02131caa3ba4631004ff049d5c66378b8fd1b9e4`.
Spec: `docs/engineering/G10-AD-VERIFICATION-SPEC.md`.
Campaign record: `docs/engineering/G10-AD-VERIFICATION-CAMPAIGN.md`.
Evidence: `docs/engineering/audits/G10-AD-INDEPENDENT-VERIFY-EVIDENCE.md`.

## 1. What changed, per module

**`src/project_verification/**` (new plane, frozen by its own 37-test suite)** —
`artifacts.ts` (the digest-bound subject / definition / request / raw result / run
event vocabulary and the `project_verification:<runId>` product ref),
`independence.ts` (the five classes, the separation contract, the model rules and
the `countsAsIndependent` decision), `registry.ts` (frozen verifier config; NO
verifier store), `provider.ts` (the §4 read seam over the canonical ProjectIR
projection and the §7 execution port), `experiment_adapter.ts` (reuse of the
validator primitives WITHOUT the SCORE→PASS helper), `store.ts` (append-only,
crash-honest history with per-project chain digests), `status.ts` (derive-only
status/freshness + `verificationIsDue`), `service.ts` (orchestration and
`runtimeFactsOf`).

**`src/project_operating/work_mode_profile.ts`** — the STRUCTURAL
`VerificationRuntimeCapabilityView` and the `verificationRuntimeCapability`
capability input. The `independentVerifier` boolean is documented as DEPRECATED: it
is still accepted and still required, but it is no longer an availability claim.

**`src/project_operating/posture.ts`** — `verificationAvailabilityOf`, the ONE
availability table for the VERIFY row, replacing the `independentVerifier` boolean
branch. A runtime capability view decides; a bare declaration is `CONDITIONAL`; no
runtime is `UNAVAILABLE` with an honest reason.

**`src/project_operating/activity.ts`** — ONE additive enum member,
`"project_verification"`, in `CANONICAL_OUTCOME_KINDS` (§21). No policy, decision
or fold changed. (Write-scope extension; justified in place.)

**`src/recipes/registry.ts`** — `verify.v1` keeps `CONDITIONAL`; its
`capabilityRequirements` becomes `["project.verification"]` (was the ambiguous
`experiment.validator`); the limitations now name the registry, the execution
binding and the head-only subject.

**`src/recipes/compiler.ts`** — `PROJECT_DEFAULT_VERIFIER_REF = "project-default"`
replaces the invented `"deterministic"` default for an absent verifier parameter.

**`src/recipes/execution.ts`** — `RecipeExecutionDeps.verification` (a live thunk),
the structural `RecipeProjectVerificationPort`, `RecipeBaseOutcome` /
`RecipeCompletedOutcome` / `RecipeModeOutcome`, the additive `verification` and
`verificationUnresolved` fields, and `verifyProjectHead`, which runs the base mode
FIRST and then verifies the exact current head. A VERIFY plan with no port returns
`capability_required`; a runtime that blocks leaves the base outcome visible and
UNRESOLVED.

**`src/advisor/advisor.ts`** — `CAPABILITY_VERIFIER = "project.verification"`; the
new `independentVerifierAvailable` capability; the rationale uses that real fact
instead of a ref-name heuristic (`isSameModelVerifier` is kept only as an explicitly
deprecated, non-consulted helper).

**`src/project_management/actions.ts`** — `ManagementVerificationContext` and the
PURE automatic `RUN_LOCAL_VERIFY` draft arm (VERIFY preferred AND a real
independent verifier AND a due head). The subject digest and verifier ref are part
of the candidate content, so a new head mints a new candidate.

**`src/project_management/service.ts`** — the untyped `verify?: { run() }` seam
becomes `ManagementVerificationPort` (the typed runtime, resolved lazily);
`capabilityAvailable("verify")` requires a real runtime and ignores the deprecated
`capabilities.verify` boolean; `verificationContext()` derives the candidate facts
purely; `RUN_LOCAL_VERIFY` executes the runtime and returns
`{ kind: "project_verification", ref: runId }` in `canonicalOutcomeRefs`; the
derived operating history resolves that new kind.

**`src/application/surface.ts` / `src/application/http.ts`** — the
`VerificationApplicationSurface` (`status`/`history`/`verifyCurrentHead` only, with
`requestedBy` filled by the surface), the `verification` surface-discovery flag and
the three routes `GET /api/verification/status`, `GET /api/verification/history`,
`POST /api/verification/verify_current_head` (a registered ref and a reason, nothing
else).

**`src/tools/application_tools.ts`** — `palimpsest_verification`
(status/history/verify_current_head) and the `verification` discovery flag. The
tool exposes no command, args, independence class, commit or subject property.

**`src/install.ts`** — the verification composition gate (a PRODUCT install gets the
first-party runtime; a BARE Work install gets nothing), the resolved default ref,
`InstalledVerification.runtimeCapability()`, the `verificationWiring` live
hand-over, the recipe/management/advisor wiring, the `verificationRuntimeCapability`
input, the application `verification` dep, and dispose of an owned store only.

**`web/src/api.ts` / `web/src/project_workspace/ProjectWorkspaceView.tsx`** — typed
verification helpers and a Verification TAB whose card names the protocol, the
run ref, the independence basis, CURRENT-vs-stale and the verdict, and explicitly
refuses to render a generic "verified" badge.

**`e2e/project-workspace.spec.ts`** — the workspace install registers a real
mechanical verifier and starts the project on the working copy's real git head;
E2E-PROJECT-04 asserts the card, a real PASS, the run ref, the history and the
refusal of an unknown verifier ref over HTTP.

**Tests** — `test/ad_verification_integration.test.ts` (new, 32 cases);
`test/ab_operating_posture.test.ts` (one assertion changed with an in-file
justification, coverage increased); `test/v_adversarial.test.ts` (one allow-list
entry added with an in-file justification).

**Docs** — the ten §34 documents.

## 2. Delivered behaviour

| Requirement | Delivered |
| --- | --- |
| §15 VERIFY availability from a real runtime | `verificationAvailabilityOf` + `InstalledVerification.runtimeCapability()`; a bare bool/ref cannot reach `AVAILABLE` |
| §16 retire fake capability inflation | the boolean is ignored wherever a capability view exists; the Advisor reads the runtime; `capabilities.verify` is ignored |
| §17 registry/compiler honesty | `project.verification`; `project-default`; no invented ref |
| §18 execution | base mode then current-head verification; `capability_required`/unresolved, never a fake success |
| §19 management reachability | a pure, deterministic `RUN_LOCAL_VERIFY` candidate |
| §20 no loop | a fresh completed run suppresses the repeat; a new head makes it due again |
| §21 policy + durability | matrix unchanged; typed execution; `project_verification:<runId>` referenced by the activity |
| §22 explicit surface | `status`/`history`/`verifyCurrentHead`, agent-safe by construction |
| §23 HTTP + web | three routes, the discovery flag, the tool, the Verification TAB, E2E-PROJECT-04 |
| §28 Advisor | read-only; the independence fact comes from the runtime |

## 3. What the stage did NOT change

```text
the management policy matrix            (asserted verbatim)
ReasoningCell verification/admission    (git-clean + seam-presence assertions)
Proof verification/publication          (git-clean + seam-presence assertions)
Work Evidence / gates / promotion       (git-clean)
the Work Mode preference model          (the two axes stay orthogonal)
the bare Work-only install              (nine tools, no advanced routes)
```

## 4. Gate results

```text
git diff --check                     exit 0
pnpm build                           exit 0 (tsc -b, no output)
pnpm exec vitest run --maxWorkers=2  160 files / 1623 tests passed
pnpm run build:web                   exit 0
pnpm exec playwright test            29 passed
node scripts/verification/mechanical-verify.mjs   pass=true (EXIT=0)
```

Baseline before this stage: 159 files / 1591 tests. The delta is the new
integration file (+1 file, +32 tests).

## 5. Honest limitations

1. **Write-scope extension.** `src/project_operating/activity.ts` is outside the
   declared integration write scope and received ONE additive enum member
   (`project_verification`), required by §21 so the activity can REFERENCE a run
   rather than copy it. No behaviour in that file changed.
2. **Firewall allow-list extension.** `test/v_adversarial.test.ts`'s V-N01
   allow-list gained `../project_verification/` with an in-file justification. This
   is a deliberate, documented admission of a narrowly-owned, non-authoritative
   product plane, matching the existing `../project_operating/` entry; the
   FORBIDDEN patterns are unchanged and the assertion still fails on any sibling
   canonical store or effect-authority import.
3. **One existing assertion was updated, not removed.**
   `test/ab_operating_posture.test.ts` asserted VERIFY `AVAILABLE` for a bare
   `independentVerifier: true`. That behaviour was the defect §16 names, so the
   assertion is now `CONDITIONAL` (with the reason asserted) and the test gained the
   real `AVAILABLE` path and the shared-context `UNAVAILABLE` path. Coverage
   strictly increased.
4. **The default runtime is composed for PRODUCT installs.** A product install now
   creates one verification-history store at the derived operating path (or
   `:memory:`). A bare Work-only install is untouched.
5. **`status()` is not free.** The derived status reads the ProjectIR projection and
   the repository head on every call, and the management assessment calls it once
   per read when a VERIFY preference is stored.
6. **No model verifier, no CLI verifier registration, no non-head subject.** All
   three are recorded as carry-forward items, with triggers.
7. **The mechanical protocol is narrow.** `git diff --check` proves nothing about
   correctness; a PASS means exactly "no whitespace errors in the tracked diff".
8. **Restart durability is proven at the store and install level**, not against a
   process kill: the §26 test disposes one installation and opens a second over the
   SAME history file. The crash semantics (an unresolved `STARTED` that fabricates
   no verdict) are proven in the core suite by writing the STARTED row through the
   store's own public API.

## 6. Bugs found in `src/project_verification/**` (reported, not fixed)

None outstanding. The one real defect the plane's own suite observed during the
core pass — `appendStart` digesting a raw timestamp while the reader normalized it,
which made a legal ISO-8601 start timestamp unreadable after persistence — was found
and fixed by the core agent before this integration, and is pinned by AD-N29b. This
integration pass found no further defect in the plane and changed no file under
`src/project_verification/**`.

## 7. Canonical checkpoint

Recorded after merge.

```text
baseline                        02131caa3ba4631004ff049d5c66378b8fd1b9e4
implementation commit           13771271cfe846bf1dc9f41382d5fe7024497ea5
  "feat(g10-ad): independent project verification runtime"
pull request                    #103  experiment/g10-ad-verification -> main
PR checks                       run 35047946475  attempt 1  e2e pass / unit pass
merged commit (canonical main)  818b58c801d0d52fe74c81062415a63418eb037d
  "Merge pull request #103 from orangeofcarl0-sys/experiment/g10-ad-verification"
tree identity                   git diff 1377127 818b58c  ->  EMPTY (identical trees)
canonical main run              35048047867  attempt 1  conclusion: success
```

All remote runs concluded green on **attempt 1**; no rerun was required.

### Reproducing the local gate

```bash
pnpm install
pnpm build
pnpm exec vitest run                        # 160 files / 1623 tests
pnpm run build:web
pnpm exec playwright test                   # 29 passed
node scripts/verification/mechanical-verify.mjs
#   PASS / MECHANICAL_INDEPENDENT / CURRENT, zero Work Evidence, zero Proof
#   publication, zero Reasoning admission
#   then a head move -> STALE_SUBJECT, new head UNVERIFIED, history retained
```


```text
G10-AD INDEPENDENT PROJECT VERIFICATION RUNTIME: PASS
```

```text
VERIFY is now a real project capability rather than a boolean, an ignored recipe
step or an untyped management stub. The exact current ProjectIR head is the v1
subject; only registered, versioned verifier protocols execute; every run is
recorded in durable append-only history with explicit independence provenance. A
real first-party mechanical verifier provides an independent path; same-model
same-context does not count and unknown separation is reported honestly. The
protocol verdicts retain their meaning and become nothing else. Work Mode reports
VERIFY available only from a real independent runtime. RUN_LOCAL_VERIFY is
reachable under the unchanged management policy and returns the durable
project_verification:<runId> reference, while a fresh run prevents automatic loops
and a new head becomes verification-due again. bind_verification is no longer
ignored in recipe execution.
```
