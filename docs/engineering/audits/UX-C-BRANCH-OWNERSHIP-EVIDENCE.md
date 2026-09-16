# UX-C — Branch ownership evidence

Baseline: `a36d37b` (canonical main after UX-B).
Stage: **UX-C — Host-Native Zero-Config Collaboration Runtime** (product track).
Spec: `SPEC-PROMPT-UX-C.md` §15, §16, §17, §36, §56 ("branch host and RecipeExecution
both own candidate submission" is a PARTIAL condition).
UXC0 audit: `docs/engineering/audits/UX-C-HOST-RUNTIME-ASSESSMENT.md` §2 and SC-2/SC-3.

This is the load-bearing evidence of the stage. The audit's headline was that the
capability existed but the shipped host did not compose it — and that where it composed
something it was **unsound**: the branch host and `RecipeExecution` both owned candidate
submission for the same branch.

**The fix is structural, not a prompt instruction.** The packaged branch composes no
ReasoningCell and registers exactly one tool; `RecipeExecution` is the sole candidate
submit/evaluate owner. No sentence in a branch prompt is load-bearing.

---

HONEST (gate review F7): the module header of `src/reasoning_cell/branch_execution.ts`
still describes the PRE-UX-C contract ("the host may ONLY read the frozen brief and submit
structured candidates through the REAL ReasoningCell service"). It is deliberately not
edited: the AD campaign's frozen-plane test (`ad_verification_integration.test.ts`,
AD-N30/§27) asserts `src/reasoning_cell/**` is unmodified, and respecting that firewall
matters more than a comment. The authoritative contract is in
`src/deployment/branch_host.ts` and `host/dsh/lib/runner.js`; the stale comment is
recorded as `CF-UXC` §4.8.


## 1. The pre-fix finding: both owners submitted

At baseline the spec's never-used phrase was literally true — the branch host and
`RecipeExecution` both called `submitCandidate` for the same branch:

1. `RecipeExecution` opened the cell and branch and spawned the branch with **the
   principal's own profile** (`src/reasoning_cell/branch_execution.ts:206-209`).
2. The branch ran `apply()` → `launchDeployment(profile)` → the **full durable project
   stack**, then registered a branch-restricted `palimpsest_reasoning` over the **same**
   SQLite path (`host/dsh/lib/index.js:67`, `:74-135`).
3. The branch agent called `palimpsest_reasoning action "candidate"` → `submitCandidate`
   wrote `CANDIDATE_SUBMITTED` and returned `PENDING`.
4. The branch exited, printing `PALIMPSEST_BRANCH_RESULT {status, statement, …}`.
5. `RecipeExecution` read `output.statement` and called `submitCandidate` **again**
   (`src/recipes/execution.ts:248-277`).

(Line citations in this section are the audit's baseline references; the audit's §2 trace
is the source of record.)

### 1.1 The two accidents that hid it

A single Explore nevertheless worked — by **two accidents**, neither a design:

- **Accident 1 — event-id idempotency on the first run.** The second submission had an
  identical payload in the non-evidence case, so its `candidateDigest` **and its event
  id** were identical (`eventId = digest(type, cellId, payload)`, `artifacts.ts:518-520`),
  and `SqliteReasoningCellStore.appendAtomic` is idempotent by event id
  (`store.ts:208-215`). The second write inserted nothing and returned the stored event;
  `submitCandidate` re-derived state, found no *admitted* claim, and returned `PENDING`
  again (`service.ts:462-471`). `RecipeExecution` then evaluated once and the claim was
  admitted. One Explore worked because two writes happened to be byte-identical.
- **Accident 2 — `DEDUPLICATED` on repeats.** The cell id is derived from the plan
  digest, so a **second identical Explore reused the cell and the branch ids**; the claim
  was already admitted, so *both* submissions returned `DEDUPLICATED`,
  `if (submitted.status !== "PENDING") continue` skipped evaluation, and
  `admittedClaimIds` was empty. The branch still reported `completed` (it only checked
  that the tool call happened, `runner.js:181-184`) and the user copy normalized it as
  "a candidate that converges on an existing claim is deduplicated, not lost"
  (`src/interaction/result_view.ts:227-229`).

The spec forbids exactly this: *"Do not rely on DEDUPLICATED as a normal success path
caused by double submission."* The first run was correct only by an accident; the second
was a false success.

### 1.2 The evidence-citation split

Double ownership was worse than a redundant row. `RecipeExecution` never forwarded
`externalEvidenceRefs` (`execution.ts:263-268` at baseline) while the branch tool could
(`index.js:122-126`). When a branch cited evidence, the two `candidateDigest`s **differed**,
so:

- the branch's candidate was **never evaluated** — an orphan `PENDING`; and
- the admitted claim **lost the citation** entirely.

So the evidence-grounded Explore path silently split provenance: one candidate admitted
without citations, one citation-bearing candidate abandoned.

### 1.3 Why a prompt fix was rejected

The only restraint on the branch was prompt text plus three `forbidden` wrappers. §17 is
explicit: *"Prompt instructions alone are NOT a capability boundary."* Removing the
branch's `submitCandidate` by asking the model not to call it would leave the capability
present and rely on the model's compliance. The fix had to remove the capability.

---

## 2. The post-fix structural proof

The packaged branch is now a **pure cognition/result adapter**
(`src/deployment/branch_host.ts`). Its capability set *is* the boundary:

| Property | Enforcement | Pinned by |
| --- | --- | --- |
| branch composes exactly ONE tool | `toolNames: Object.freeze([BRANCH_RESULT_TOOL_NAME])` (`src/deployment/branch_host.ts:300`) | UXC-N07/N08; local dogfood `branch_environment_has_exactly_one_host_private_tool` |
| branch has NO principal tool | `principalTools: Object.freeze([])` (`:301`) | UXC-N07; dogfood `branch_environment_exposes_no_principal_only_tool` |
| branch composes no ReasoningCell | no ReasoningCell import; `grep ReasoningCellService src/deployment/branch_host.ts` → exit 1 | anti-waste §7; UXC-N10 |
| strict one-result tool | `makeRecorder` refuses a second result and off-allowlist citations (`:201-228`) | UXC-N07/N17 |
| branch output is not a claim | tool returns a plain `{accepted, detail}` (`src/deployment/branch_host.ts:260-267`) | UXC-N09 (`test/uxc_host_runtime.test.ts:356-371`) |
| branch mode dispatched before any deployment | `flagValue('--branch')` before `launchDeployment` (`host/dsh/lib/index.js:134-138`) | UXC (host bundle dispatch test) |

The shipped host's branch path names no deployment, no ReasoningCell service and no
fabricating policy: the structural test asserts `host/dsh/lib/index.js` does **not**
contain `SqliteReasoningCellStore`, `makeReasoningCellService` or
`standing: 'SUPPORTED'`, and **does** contain `composeBranchHostEnvironment`
(`test/uxc_host_runtime.test.ts:393-403`).

### 2.1 One submission per completed branch

`RecipeExecution` is now the sole owner and forwards the branch's cited refs
(`src/recipes/execution.ts:286-305`). UXC-N10 asserts, on the real packaged deployment:

```text
CANDIDATE_SUBMITTED events === completed branches      (exactly one owner)
CLAIM_ADMITTED events       === returned findings
cited evidence refs         === the branch's cited refs
CANDIDATE_DEDUPLICATED      === []                     (zero — never a success path)
```

The evidence refs are enforced structurally by the branch host **before** the result
exists (the allowlist check in `makeRecorder`, `src/deployment/branch_host.ts:212-221`),
then normalized by the recipe (`evidenceRefsFromOutput`,
`src/recipes/execution.ts:224-240`). The citation is no longer lost.

### 2.2 The real DSH dogfood confirms it

The packaged local dogfood runs real ephemeral DSH subprocesses and asserts:

```text
exactly_one_candidate_owner
  {"branchReportedDigests":[], "submitted":<n>, "completedBranches":<n>, "deduplicated":0,
   "note":"the branch has no ReasoningCell; RecipeExecution submitted once per branch"}
```

(`scripts/interaction/uxc-dsh-local-dogfood.mjs:226-229`.) `branchReportedDigests` is
empty because the branch has no cell to report a digest from — the ownership claim is
structural, never an observation of `DEDUPLICATED` (SC-2). The cross-project dogfood
re-asserts the same on the answering side with
`b_execution_remains_the_sole_candidate_owner`
(`scripts/interaction/uxc-dsh-cross-project-dogfood.mjs:222-226`).

### 2.3 The rewired harnesses

The two legacy harnesses that asserted the old contract were rewired to the new one
(not left asserting a stale shape): `scripts/recipes/explore-e2e.mjs` now requires
`branchComposesNoReasoningCell` (zero branch-reported digests),
`exactlyOneSubmissionPerBranch`, and `branchStatementsLandedInRealStore`;
`scripts/proof/real-extraction-e2e.mjs` and `scripts/recipes/explore-e2e.mjs` no longer
hand-inject `reasoningCellStore` into the host profile.

---

## 3. The regression that fails pre-fix

The claim "the fix is structural" is only meaningful if a revert fails. The regression
is UXC-N10 (`test/uxc_host_runtime.test.ts:410-437`) together with the branch-firewall
tests (UXC-N07/N08/N09, `:321-404`) and the dogfood checks above:

- Re-introducing a branch-side `submitCandidate` would make
  `CANDIDATE_SUBMITTED` exceed one-per-branch (UXC-N10 `expect(submitted).toHaveLength(...)`),
  and/or make the branch report a candidate digest (dogfood `exactly_one_candidate_owner`).
- Re-introducing the full principal branch environment would make
  `environment.toolNames` larger than one tool and break UXC-N07/N08.
- Dropping the forwarded evidence refs would break the `cited` assertion in UXC-N10 and
  `branchStatementsLandedInRealStore` in the explore harness.

The pre-fix path (a branch that both submits and reports a digest, with a second recipe
submission) fails every one of these. No assertion in this set observes `DEDUPLICATED`
as evidence of correctness (SC-2).

---

## 4. What this evidence does and does not claim

- **Claims:** one branch execution → one structured result → `RecipeExecution` is the
  sole candidate submit/evaluate owner, by construction and by real-subprocess run.
- **Does not claim:** that the kernel forbids double submission in general. The kernel
  still permits a tool to call `submitCandidate`; what UX-C proves is that the **packaged
  DSH branch environment does not contain that capability** — the boundary is the
  capability set, and it is composed by the host, not requested of the model.
- **Does not claim:** a live model-driven branch conversation. The branch subprocess is
  real; the branch's *"thinking"* is the host model's, which the dogfood does not drive.
