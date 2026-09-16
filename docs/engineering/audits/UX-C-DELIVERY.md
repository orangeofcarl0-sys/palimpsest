# UX-C — Host-native zero-config collaboration runtime delivery report

Stage: **UX-C — Host-Native Zero-Config Collaboration Runtime** (Palimpsest product track).
Baseline: `a36d37b` (canonical main after UX-B).
Branch: `experiment/ux-c-host-runtime`.
Spec: `SPEC-PROMPT-UX-C.md`.
UXC0 audit (20 answers, load-bearing finding, 14 binding corrections):
`docs/engineering/audits/UX-C-HOST-RUNTIME-ASSESSMENT.md`.
Anti-waste: `docs/engineering/audits/UX-C-HOST-RUNTIME-ANTI-WASTE.md`.
Branch ownership evidence: `docs/engineering/audits/UX-C-BRANCH-OWNERSHIP-EVIDENCE.md`.
Packaged dogfood evidence: `docs/engineering/audits/UX-C-PACKAGED-DOGFOOD-EVIDENCE.md`.
Readiness contract: `docs/engineering/audits/UX-C-HOST-RUNTIME-READINESS.md`.
Carry-forward: `docs/engineering/audits/UX-C-CARRY-FORWARD.md`.
Product docs: `docs/product/ZERO-CONFIG-COLLABORATION.md`,
`docs/product/DSH-COLLABORATION-RUNTIME.md`.

The stage is packaging: **three new modules** in `src/deployment/**`, one strict branch
tool, one derived readiness view, one host bundle rewritten to dispatch mode first, and
truthful product copy. It adds no canonical store, no semantic event, no Agent identity,
no scheduler, no authority, no second ReasoningCell and no second federation protocol
(`SPEC-PROMPT-UX-C.md` §2; anti-waste §1–§12).

## 1. What changed, per file

### 1.1 New — the packaged local-collaboration bundle

**`src/deployment/reasoning_bundle.ts`** (new, 152 lines) — the first-party local
collaboration bundle over EXISTING seams. `deploymentReasoningStorePath` derives
`<orchestration dir>/reasoning.sqlite` (`:150-152`); `firstPartyExploratoryVerificationPolicy`
returns `standing: "INCONCLUSIVE"` with frozen empty evidence lists, bound to the cell,
the candidate, the current `frontierBasis` and the cell definition's OWN
`verificationPolicyRef`, with a deterministic provenance digest, and **refuses** a cell
opened under any other ref (`:66-97`); `firstPartyExploratoryAdmissionPolicy` `ADMIT`s
**only** the exact first-party recipe Explore ref, else `UNRESOLVED`, with its digest
naming the *meaning* of the decision (`:99-143`). No store is read, no cell opened, no
branch spawned (corrections SC-4/SC-5).

**`src/deployment/branch_host.ts`** (new, 304 lines) — the minimal packaged DSH branch
environment. `parseBranchHostPayload` accepts a bare `ReasoningBranchBrief` or
`{brief, evidenceContext}` and fails closed otherwise (`:144-175`);
`makeBranchResultRecorder` enforces one successful result per branch, sticky failure and
the structural evidence allowlist (`:177-229`); `defineBranchResultTool` is the ONE
host-private strict tool `palimpsest_branch_result` (`:240-268`);
`composeBranchHostEnvironment` returns exactly `toolNames: ["palimpsest_branch_result"]`
and `principalTools: []` (`:289-304`). The capability set is the boundary, not a prompt
(SC-2/SC-3/SC-6/SC-7).

**`src/deployment/readiness.ts`** (new, 68 lines) — `HostCollaborationReadiness` and the
pure `deriveHostCollaborationReadiness`. Nine fields; no numeric score, no semantic
health truth, no store read (`:12-68`; spec §30).

### 1.2 Modified — the deployment and install plumbing

**`src/deployment/profile.ts`** — `DeploymentReasoningConfig` with at most ONE advanced
override (`storePath`) (`:76-88`); the additive `reasoning?` profile field (`:130-140`);
`parseReasoning` whose `exactKeys` refuses a semantic/authority field (`:305-318`); the
`sessionId` requirement relaxed for `activation: "dsh"` only, since the host late-binds
the persisted session (`:284-291`). Corrections SC-9/SC-12.

**`src/deployment/launch.ts`** — `DeploymentHostServices.branchExecution` (`:60-68`); the
deployment-owned store + the two exploratory policies, composed only when the profile
carries `reasoning` (`:306-313`, `:418-432`); `unboundDshActivation` for a DSH activation
whose host session is not yet bound (`:250-258`); `Deployment.reasoning` status with
explicit `storeOwned` (`:128-136`, `:516-520`); `bindAttentionActivation` late-binding
that never flips an explicit `"none"` to active (`:489-495`); `collaborationReadiness`
(`:496-508`); and `close()` that closes ONLY the store the deployment created (`:529-533`).
Corrections SC-4/SC-9/SC-11/SC-13/SC-14.

**`src/deployment/index.ts`** — the barrel re-exports the new bundle, branch environment
and readiness symbols (`:60-100`).

**`src/install.ts`** — the advisor is composed whenever its descriptive deps exist (a
local peer) or an empirical memory store is supplied, with `memory` omitted when there is
none (`:1623-1640`); the explicit `reasoningCellStoreOwned` install option (`:374`) and
the conditional close in `dispose()` (`:2451-2456`). Corrections SC-4/SC-5.

**`src/advanced.ts`** — now re-exports `./interaction/index.js` so the host entry can
reach `crossProjectAttentionText` (SC-8).

### 1.3 Modified — recipes and interaction truthfulness

**`src/recipes/execution.ts`** — `RECIPE_VERIFICATION_POLICY` / `RECIPE_ADMISSION_POLICY`
exported read-only (`:187-188`); `evidenceRefsFromOutput` (`:224-240`); the branch's own
cited refs forwarded as `externalEvidenceRefs` on the ONE submission
(`:286-305`). Correction SC-3.

**`src/interaction/result_view.ts`** — `EXPLORATORY_FINDING_NOTE` and the typed
`EXPLORATORY_CELL_LOCAL` standing (`:31-46`); `findingStanding`/`findingNote` on
`CollaborationResult` (`:176-180`); the note appended to the primary summary (`:260-266`);
the verification sentence prefixed with `Separately:` and explicitly disclaiming finding
verification (`:268-289`). Correction SC-10.

**`src/interaction/intent.ts`** — the verbs `LOCAL_VERIFY` → "Verify current project head"
and `LOCAL_EXPLORE_AND_VERIFY` → "Explore alternatives locally, then verify the current
project head" (`:258-266`).

**`src/interaction/collaboration.ts`** — `exploratoryFindingFields` derives the typed
standing from the findings and the execution kind (`:52-74`); the exploratory label is
carried on both result-construction paths (`:838-862`, `:969-1010`); the `didWhat`
sentences state two independent facts (`:969-990`).

**`src/interaction/cross_project_result.ts`** / **`cross_project.ts`** — a composed
exploratory answer carries the typed label locally as well as inside the answer text that
travelled (`cross_project_result.ts:102-115`, `:213-240`;
`cross_project.ts:1111-1150`, `:1265-1275`).

### 1.4 Modified — the shipped DSH host

**`host/dsh/lib/index.js`** — mode dispatched BEFORE any composition: `--branch` composes
only the branch environment and returns (`:98-138`); the branch path registers exactly one
tool and names no deployment, no ReasoningCell service and no fabricating policy
(`:98-129`); `deriveBranchExecution` builds the ephemeral port from the host's own bin and
profile (`:77-92`); the fabricating `SUPPORTED` policy is **deleted** (SC-5/SC-6/SC-7).

**`host/dsh/lib/runner.js`** — the runner schedules `deployment.pumpAndActivate()` instead
of re-implementing pump → drain → activate → mark (`:300-321`); late-binds the
resume-capable activation adapter to the created/resumed principal (`:214-233`); formats
inbound peer attention with the PRODUCT cross-project text (`:205-208`); and prints the
extended `PALIMPSEST_HOST_READY` line including `collaboration` readiness (`:238-254`).
Corrections SC-8/SC-9/SC-11.

### 1.5 New/modified — tests, rigs and rewired harnesses

**`test/uxc_host_runtime.test.ts`** (new, 844 lines, **23 tests**) — UXC-N01…N29 on real
packaged deployments. UXC-N30 (full CI) is the suite gate and is not faked in-suite.

**`scripts/interaction/uxc-dsh-local-dogfood.mjs`** (new, 318 lines) — the §33/§34 local
golden path with real DSH branch subprocesses.

**`scripts/interaction/uxc-dsh-cross-project-dogfood.mjs`** (new, 350 lines) — the
§38–§41 cross-project path including the cold-resume proof.

**Rewired harnesses/tests** — `scripts/interaction/uxa-dogfood.mjs` (C3 fallback now via a
bare service; new C4 memoryless-advisor AUTO-Explore),
`scripts/interaction/uxb-two-project-dogfood.mjs` (honest notes updated to the
`reasoning: {}` bundle), `scripts/recipes/explore-e2e.mjs` and
`scripts/proof/real-extraction-e2e.mjs` (rewired to the branch-result contract; no
hand-injected reasoning store), `test/p_deployment.test.ts` (the new profile rules),
`test/s_recipes.test.ts` (the memoryless advisor expectations).

## 2. Delivered behaviour

1. **A normal project can Explore with no manual reasoning wiring.** A profile carrying
   only `reasoning: {}` gets a deployment-owned store beside the orchestration DB, the two
   exploratory policies and the host-derived branch port; `PARALLEL` runs real branches
   (`UXC-N05/N06`; local dogfood `deployment_profile_carried_only_reasoning_empty`,
   `parallel_ran_real_ephemeral_branches`).
2. **AUTO works without OrganizationMemory.** The Advisor is composed whenever the
   installation can act; with no memory it claims no empirical evidence and AUTO chooses
   FOCUS or EXPLORE from the real task profile (`UXC-N01…N04`; local dogfood
   `memoryless_auto_selects_*`, `memoryless_advisor_claims_no_empirical_evidence`).
3. **The default branch is a pure result adapter.** Exactly one tool, no principal tool,
   no ReasoningCell, no identity (`UXC-N07/N08/N09`; local dogfood
   `branch_environment_has_exactly_one_host_private_tool`,
   `branch_environment_exposes_no_principal_only_tool`).
4. **One candidate owner.** `RecipeExecution` submits once per branch, with the branch's
   cited refs; zero `DEDUPLICATED`; the branch reports no digest (`UXC-N10`; dogfood
   `exactly_one_candidate_owner`). See `UX-C-BRANCH-OWNERSHIP-EVIDENCE.md`.
5. **Default Explore is honestly exploratory.** INCONCLUSIVE with empty evidence; the
   admission is labelled cell-local and not truth; no `SUPPORTED` without a real stronger
   policy (`UXC-N11/N12/N13`; dogfood
   `default_explore_standing_is_inconclusive_with_no_evidence`).
6. **CHECK stays project-head verification.** The verbs and the summary state two
   independent facts and never imply findings verification (`UXC-N14/N15`).
7. **The shipped attention path uses the product formatter and real resume.** Inbound
   peer signals format with `crossProjectAttentionText`; the adapter cold-resumes and
   queues a followup; a failed activation leaves the signal pending (`UXC-N16/N17/N18/N19`;
   cross-project dogfood `b_attention_uses_the_product_cross_project_text`,
   `cold_resume_get_undefined_resume_called_followup_queued`,
   `failed_activation_leaves_the_signal_pending`).
8. **The deployment owns the lifecycle; the runner only schedules it.** One
   pump → drain → activate → mark-after-success (`UXC-N20`; `host/dsh/lib/runner.js:300-321`).
9. **Cross-project send remains explicit.** AUTO stops at `CROSS_PROJECT_REQUIRED` with
   zero sends; only an explicit Ask sends (`UXC-N21/N22`).
10. **A packaged project answers, locally.** B answers an Ask with its own packaged
    PARALLEL Explore or a FOCUS continuation (`UXC-N23/N24`; dogfood
    `b_packaged_local_explore_answered_the_ask`, `b_packaged_focus_answered_without_branches`).
11. **Zero hidden work at idle.** Wiring the bundle (including a branch-capable one)
    spawns no branch, sends no message, runs no verification, queries no external asset
    and ticks no Monitor (`UXC-N26/N27`).
12. **Restart preserves semantic owners, not branch sessions.** The reasoning store,
    verification history, project bindings and cross-project pending state rederive;
    branches stay ephemeral (`UXC-N28`).

## 3. What the stage did NOT change

- **No new canonical plane, store type, table, authority, Agent ontology, scheduler or
  protocol** (anti-waste §1–§12).
- **`src/coordination/**`, `src/transport/**`, `src/federation/**`, `src/attention/**`
  and `src/project_workspace/**` are byte-identical to the baseline** —
  `git diff --name-only a36d37b -- src/coordination src/transport src/federation
  src/attention src/project_workspace` is empty (anti-waste §2).
- **`host/dsh/lib/startup.js` is unchanged.**
- **No new first-class tool species** beyond the host-private
  `palimpsest_branch_result`; no expert tool, surface member or route was removed or
  narrowed.
- **`MAX_BRANCH_HINT` remains 8** and the kernel still has no branch ceiling
  (`CF-UXA-01` open; anti-waste §13.1).
- **`domainGate` remains unwired** (`CF-UXB-09` open; `grep -rn "domainGate" src/`
  returns only the two lines inside `src/interaction/cross_project.ts`).
- **The fuzzy project resolver remains unwired** (`CF-UXB-04` open).
- **No web UI change.** The web gates are regression gates only.
- **The `CF-AE-R-05` proof and the AE/AD/AC-R planes are untouched.**

## 4. Gate results

> ```text
> git diff --check                               exit 0
> pnpm build                                     clean
> pnpm exec vitest run --maxWorkers=2            167 files / 1846 tests passed   (baseline 166 / 1823)
> pnpm run build:web                             exit 0
> pnpm exec playwright test                      36 passed
> node scripts/interaction/uxc-dsh-local-dogfood.mjs        pass=true (real DSH branches, INCONCLUSIVE, fan-out held)
> node scripts/interaction/uxc-dsh-cross-project-dogfood.mjs pass=true (A asks B, B packaged Explore answers, cold resume)
> node scripts/interaction/uxb-two-project-dogfood.mjs      pass=true
> node scripts/interaction/uxa-dogfood.mjs                  pass=true
> node scripts/scope/aer-boundary-dogfood.mjs               pass=true
> scripts/recipes/explore-e2e.mjs / scripts/proof/real-extraction-e2e.mjs   PASS (harnesses rewired to the new branch contract)
> ```

HONEST: this report was written during the UX-C documentation pass. The figures above
are the stage's certified final-tree figures, quoted as given; the documentation pass
read the tree and ran only read-only commands plus the anti-waste greps, and **ran none
of the gates**. No commit SHA, pull-request number or CI run id is invented in this
document — the canonical checkpoint (§8) carries none.

The spec's PASS criterion (§55) is met: the shipped first-party DSH product now provides
the collaboration experience UX-A and UX-B proved, with a memoryless Advisor, a durable
local store and safe ephemeral branches with no OrganizationMemory prerequisite; the
branch host is capability-restricted, owns no candidate semantics and cannot reach
principal-only surfaces; default findings are INCONCLUSIVE and labelled not-truth; CHECK
remains project-head verification; the shipped attention path uses the product formatter
and real resume over one lifecycle; and zero-config grants no new authority and performs
no hidden work at idle.

## 5. Machine invariants HCR-A01…A24

Enforcement is the code that makes the invariant true; pinning is the test or gate that
fails if it is reverted. `test/uxc_host_runtime.test.ts` is abbreviated `uxc.test.ts`.

| ID | Invariant | Enforcement | Pinned by |
| --- | --- | --- | --- |
| A01 | host packaging owns no semantic truth | `src/deployment/readiness.ts:1-10`, `:52-68`; anti-waste §1/§4 | UXC-N26 (`uxc.test.ts:729`); anti-waste |
| A02 | Advisor can exist without OrganizationMemory | `src/install.ts:1623-1640` | UXC-N01 (`:263`); `test/s_recipes.test.ts:351` |
| A03 | no empirical memory means no empirical claim | `src/advisor/advisor.ts:399-401`; `src/install.ts:1629` | UXC-N02 (`:270-274`) |
| A04 | branch capability wiring alone spawns no branch | `src/deployment/launch.ts:306-313` (composes only) | UXC-N26/N27 (`:729`); dogfood idle checks |
| A05 | default branch is ephemeral | `src/deployment/branch_host.ts:14-19`; `host/dsh/lib/runner.js:109-161` | UXC-N07/N08 (`:332`) |
| A06 | branch cannot mutate principal-owned surfaces | `src/deployment/branch_host.ts:289-304` | UXC-N07/N08 (`:332-353`) |
| A07 | RecipeExecution remains candidate submit/evaluate owner | `src/recipes/execution.ts:286-305` | UXC-N10 (`:411`) |
| A08 | default Explore does not claim SUPPORTED | `src/deployment/reasoning_bundle.ts:66-97` | UXC-N11 (`:445`) |
| A09 | exploratory admission != truth/evidence | `src/deployment/reasoning_bundle.ts:99-143` | UXC-N09/N13 (`:356`, `:445-475`) |
| A10 | Project Verification target remains current project head | `src/project_verification/artifacts.ts` (unchanged) | UXC-N14 (`:483`) |
| A11 | finding verification is not implied | `src/interaction/result_view.ts:260-289`; `src/interaction/collaboration.ts:969-990` | UXC-N15 (`:504`) |
| A12 | pump semantics remain at-least-once | `src/deployment/launch.ts:pumpAndActivate`; cursor after ingest | UXC-N19 (`:576`); dogfood `failed_activation_leaves_the_signal_pending` |
| A13 | Attention remains semantic derivation owner | `src/attention/service.ts` (unchanged) | UXC-N20 (`:611`) |
| A14 | activation remains host-only | `src/deployment/launch.ts:489-495` | UXC-N18 (`:556`) |
| A15 | failed activation does not mark delivered | `host/dsh/lib/runner.js:231-233`; pump mark-after-success | UXC-N19 (`:576`); dogfood check |
| A16 | DSH resume session != PeerRef | `src/deployment/profile.ts:284-291`; `host/dsh/lib/runner.js:214-230` | UXC-N18 (`:556`) |
| A17 | cross-project send remains explicit | `src/interaction/cross_project.ts:773`, `:1259` | UXC-N21/N22 (`:643`) |
| A18 | projectDirectory remains deployment metadata | `src/deployment/profile.ts`; `src/deployment/launch.ts` | UXC-N21/N25 (`:643`, `:699`) |
| A19 | no new interaction store | `src/interaction/index.ts` barrel owns no store module | UXC-N28 (`:753`) |
| A20 | no new kernel species | `git diff` empty over coordination/transport/federation/attention/project_workspace | anti-waste §2 |
| A21 | packaged UX-A works | `src/deployment/reasoning_bundle.ts`, `branch_host.ts` | UXC-N05/N10/N11 (`:301`, `:410`, `:444`); local dogfood |
| A22 | packaged UX-B works | cross-project face from `projectDirectory` | UXC-N21/N23 (`:643`, `:669`); cross-project dogfood |
| A23 | full regression green | the suite | `pnpm exec vitest run --maxWorkers=2` (UXC-N30) |
| A24 | required CI green | the CI gates | the CI run for this branch (UXC-N30) |

## 6. UXC-N01…N30 coverage map

`test/uxc_host_runtime.test.ts` — **23 tests**. Line numbers are describes.

| ID | Property | Where pinned |
| --- | --- | --- |
| N01 | memoryless Advisor exists | `:262` |
| N02 | memoryless Advisor claims no empirical evidence | `:262-275` |
| N03 | packaged AUTO can choose FOCUS | `:278-286` |
| N04 | packaged AUTO can choose EXPLORE (with the SC-1 verifiability marker) | `:288-294` |
| N05 | normal DSH PARALLEL needs no manual reasoning store | `:301-314` |
| N06 | normal DSH PARALLEL needs no manual branch port | `:301-314` |
| N07 | branch host creates no PeerRef/PersistentPoint | `:321-354`, `:373-391` |
| N08 | branch host has no principal-only mutation tools | `:332-353` |
| N09 | branch output is not itself a ReasoningClaim | `:356-371` |
| N10 | exactly one candidate owner path exists | `:410-437` |
| N11 | default Explore verification standing is INCONCLUSIVE | `:444-461` |
| N12 | default Explore invents no Evidence | `:445-475` |
| N13 | exploratory admission is labelled not-truth | `:469-475` |
| N14 | CHECK remains project-head verification | `:482-502` |
| N15 | PARALLEL_AND_CHECK does not imply finding verification | `:504-523` |
| N16 | runner uses product cross-project attention formatting | `:530-548` |
| N17 | attention formatting contains no peer-message body | `:531-547` |
| N18 | shipped DSH activation adapter exposes resume() | `:555-574` |
| N19 | failed activation leaves signal pending | `:576-609` |
| N20 | packaged inbound pump does not need user polling | `:611-630` |
| N21 | packaged cross-project Ask remains explicit | `:643-667` |
| N22 | AUTO cannot silently send cross-project | `:643-667` |
| N23 | packaged remote project can local-Explore | `:669-688` |
| N24 | packaged remote project can FOCUS-answer | `:689-697` |
| N25 | Ask creates no commitment | `:699-722` |
| N26 | idle packaged host spawns no branches | `:728-746` |
| N27 | idle packaged host sends no messages | `:728-746` |
| N28 | restart preserves semantic owners, not branch sessions | `:752-825` |
| N29 | UX-B/UX-A/AE-R/AD/AC-R regression surfaces remain composed | `:831-844` |
| **N30** | **full CI green — the SUITE GATE, not an in-suite assertion** | `pnpm exec vitest run --maxWorkers=2` (**167 files / 1846 tests passed**, baseline 166 / 1823), plus `pnpm exec playwright test` (36 passed), `pnpm run build:web` and `pnpm build` |

**N30 is the suite gate.** It is deliberately **not** asserted inside the UX-C suite: a
stage cannot prove the whole regression set green from inside one of its files. No
document in this set may describe N30 as an in-suite test.

## 7. Honest limitations

### 7.1 The packaged dogfood is in-process (no live principal turn)

The two UX-C dogfoods drive the deployment lifecycle in-process and spawn real DSH
subprocesses per branch, but no live model-driven principal turn. The runner's scheduling
is proven structurally and via the cold-resume section. See
`UX-C-PACKAGED-DOGFOOD-EVIDENCE.md` §4.

### 7.2 OS-level daemon resurrection is out of scope

UX-C proves cold-resume of a persisted agent session inside a running host, not restarting
a dead OS process. Stated in the cross-project dogfood's own `honestNotes`
(`scripts/interaction/uxc-dsh-cross-project-dogfood.mjs:333-338`).

### 7.3 The packaged branch environment is DSH-specific

`composeBranchHostEnvironment` is built on DSH tool types and the only shipped branch
runner is `host/dsh/**`. There is no packaged Pi branch runner; §45 does not block PASS on
that. Carried forward.

### 7.4 The profiler is lexical

AUTO/EXPLORE needs explicit keyword markers, including a verifiability marker (SC-1).
`CF-UXA-04` remains open.

### 7.5 `MAX_BRANCH_HINT = 8` is the product's own bound

The kernel has no branch ceiling. `CF-UXA-01` remains open; no document may claim
otherwise.

### 7.6 The doc set is written during in-flight gates

This documentation pass read the tree and ran only read-only commands plus the anti-waste
greps. It ran no gate. §4's figures are the stage's, not this document's.

### 7.7 The readiness view is derived and non-authoritative

`HostCollaborationReadiness` reports composed capabilities only. It is not health, not
authority and not a score; a wired capability performs no work until requested (see the
two honest caveats in `UX-C-HOST-RUNTIME-READINESS.md` §5).

## 8. Canonical checkpoint

Recorded after merge. No commit SHA, pull-request number or CI run id is recorded in this
document: the documentation pass did not author or observe the merge, and inventing an
identifier would be a fabricated claim. The canonical identity and the green CI runs are
those of this branch's merge on canonical main, and are re-verifiable from git and CI at
that time.

Recorded after merge.
