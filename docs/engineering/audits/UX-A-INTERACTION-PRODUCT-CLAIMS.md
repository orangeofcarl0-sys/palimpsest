# UX-A — Interaction product claims audit

Baseline: `437d1c9a6e1dc9a9ff36754096aaad98e787a184`.
Stage: **UX-A — One-Request Local Multi-Agent Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-A.md`.

This is a blunt claims sheet. For each promise the product now makes, it gives the
**exact mechanism** and the **test that pins it**, so a reader can falsify every
claim from this page. A "PREVENTED" / "PINNED" verdict means the repository makes a
counter-claim unsupportable by the shipped code paths — not that the words cannot be
typed into a document.

Sources: `src/interaction/**`, the four modified faces, and
`test/uxa_collaboration.test.ts` (39 tests, UXA-N01…N24 plus the gate-review regressions).

Verdict summary:

```text
one request is enough for the local golden path        PINNED (UXA-N21)
branch fan-out is bounded                              PINNED (UXA-N23)
only ephemeral branches, never a durable agent         PINNED (UXA-N05/N13/N14)
verification is real, never a substitute               PINNED (UXA-N07/N08)
no chain-of-thought is returned                        PINNED (UXA-N16)
cross-project is a handoff, not an action              PINNED (UXA-N12/N13/N14)
```

---

## 1. "One request is enough" (local collaboration)

**Claim.** A user or host can ask for local multi-agent collaboration in one
high-level call, without constructing a `TaskProfile`, `RecipePlan`,
`CompiledRecipePlan`, a ReasoningCell or a verification workflow.

**Mechanism.** `palimpsest_collaborate` with `action` `plan|run`
(`src/tools/application_tools.ts:517-577`) and the matching
`application.collaboration.plan|run` surface (`src/application/surface.ts:1143-1149`,
returned at `:1438`). Inside the service, one request profiles, selects, compiles,
executes and projects (`src/interaction/collaboration.ts:976-1047,843-942`). The
caller supplies a task and an intent; `requestedBy` is derived (`:564-573`).

**Pinned by.** UXA-N21 in `test/uxa_collaboration.test.ts`: one
`palimpsest_collaborate` call with `intent: "PARALLEL_AND_CHECK"` returns
`COMPLETED` with two findings, a verification block and populated `details` — on a
real install, with no cell id, recipe id or verifier id supplied by the caller.

**Falsify by.** Calling the tool with a `parallel ... check` task and seeing any
required intermediate artifact in the input, or an empty `findings`/`verification`
on a deployment that has the capabilities.

## 2. "Branch fan-out is bounded"

**Claim.** The number of branches is bounded, and an out-of-range request is refused
rather than silently clamped or expanded.

**Mechanism.** `MIN_BRANCH_HINT = 2` / `MAX_BRANCH_HINT = 8`
(`src/interaction/intent.ts:52-55`); the parser refuses a non-integer or
out-of-range hint with reason `invalid_branch_count` and the text "refused rather
than clamped" (`:173-189`); the tool refuses a non-integer hint at its boundary
(`src/tools/application_tools.ts:552-555`). `MIN_BRANCH_HINT` is the compiler's own
rule (`src/recipes/compiler.ts:79-87`).

**Pinned by.** UXA-N23 (two tests): `0`, `1`, `9`, `-3`, `2.5`, `NaN`, `Infinity`
and `"2"` are all refused at the parser and at the tool, and nothing runs (no cell,
no branch).

**Falsify by.** Passing `branchCountHint: 100` and observing branch execution.

HONEST: `MAX_BRANCH_HINT = 8` is UX-A's own ceiling. The kernel has no branch
maximum, so this bound is owned by the product layer and is carried forward
(`CF-UXA-01`). The claim is "bounded here", not "bounded by the kernel".

## 3. "Only ephemeral branches — never a durable agent"

**Claim.** Exploration runs on ephemeral reasoning branches. UX-A mints no durable
peer, no persistent point, no agent definition and no project principal.

**Mechanism.** `src/interaction/**` imports nothing from `src/federation`,
`src/boundary_memory` or any identity materializer (anti-waste §4). PARALLEL goes
through the existing EXPLORE recipe, which opens a reasoning cell with ephemeral
branches (`src/interaction/collaboration.ts:520-566`). No code path in the layer can
send a peer message or create a commitment.

**Pinned by.** UXA-N05: after a real PARALLEL run, `rig.sent === []`, the peer
directory was never observed (`rig.directoryCalls === []`),
`federation.commitments() === []`, and the local peer's inbox is unchanged.
UXA-N13/N14: the same assertions on the COORDINATE path.

**Falsify by.** Finding any outbound peer message, commitment or peer-directory
observation attributable to a collaboration run.

## 4. "Verification is real — never a substitute"

**Claim.** `CHECK` uses only the real Project Verification runtime on the exact
current project head. If no independent verifier exists, the answer is
`CAPABILITY_REQUIRED`; a same-context verifier is not accepted as an independent
check.

**Mechanism.** The derived availability is the same fact the rest of the product
uses: `verificationCapability()` reads `ProjectVerificationStatus.independentVerifyAvailable`
(`src/interaction/collaboration.ts:184-203`). CHECK refuses when it is false
(`:632-671`). The verification result is projected from the existing
`RecipeVerificationSummary` with the mandatory note
(`src/interaction/result_view.ts:82-83,100-112`).

**Pinned by.** UXA-N07/N08 (four tests): an independent verifier produces a real
durable run and `verdict: "PASS"`; no runtime produces `CAPABILITY_REQUIRED` with
zero runs; a verifier that really executes and really PASSES but shares the authoring
context still yields `CAPABILITY_REQUIRED` with zero runs and no `PASS` in the
summary; an unregistered `verifierRef` yields `PARTIAL` with `unknown_verifier_ref`.

**Falsify by.** Getting a `PASS` from a deployment whose only verifier is
same-context, or a `COMPLETED` CHECK with no run in the durable history.

## 5. "No chain-of-thought is returned"

**Claim.** Findings are admitted, current claims with their content. No scratchpad,
branch brief, sibling candidate, frontier basis, cell event or hidden reasoning is
exposed.

**Mechanism.** Findings are projected from `ReasoningCellService.activeClaims`
(`src/interaction/collaboration.ts:891`), mapped field-by-field in
`collaborationFindingsFrom` (`src/interaction/result_view.ts:48-59`). The module
imports no store (`result_view.ts:14-18`). The kernel has no CoT field to carry.

**Pinned by.** UXA-N16: the serialised golden-path payload is asserted not to
contain `scratchpad`, `chainOfThought`, `chain_of_thought`, `branchBrief`, `brief`,
`candidateDigest`, `acceptedClaims`, `frontierBasis`, `events`,
`VERIFICATION_RECORDED`, `CANDIDATE_SUBMITTED`, or the `[branch 1/` question
suffix.

**Falsify by.** Finding any of those tokens in a serialised `CollaborationResult`.

HONEST: the projection is **verbatim** — it copies `claim.content` as-is. If a
branch execution port writes plumbing into its statement (the branch question itself
carries a `` [branch k/n] `` suffix, `src/recipes/execution.ts:243`), that text would
appear in a finding. The suite's port deliberately does not echo it. Carried as
`CF-UXA-05`.

## 6. "Cross-project is a handoff, not an action"

**Claim.** When the correct architecture is cross-project, UX-A returns
`CROSS_PROJECT_REQUIRED` and performs zero peer messages, zero commitments and zero
boundary mutations. It leaves the boundary to UX-B.

**Mechanism.** The COORDINATE recommendation is detected by plan identity
(`src/interaction/collaboration.ts:475-496`) and short-circuits before compiling or
executing the coordinate plan; peers come from the recommendation's own
`existingSubjectRefs`. The run path for that kind makes no mutating call
(`:1008-1016`). `src/interaction/**` does not import federation.

**Pinned by.** UXA-N12/N13/N14: on a real install with a known independent peer, the
result is `CROSS_PROJECT_REQUIRED` with `details.peers === ["peer-independent-1"]`,
`rig.sent === []`, `rig.directoryCalls === []`, `federation.commitments() === []`,
an unchanged inbox, and an unchanged ProjectIR head.

**Falsify by.** Any peer message, commitment, boundary revision or ProjectIR
revision caused by a `CROSS_PROJECT_REQUIRED` outcome.

HONEST: this proves the **handoff mutates nothing**. It does **not** prove a
cross-project boundary holds — no peer exchange happens. `CF-AE-R-05` is not closed
by UX-A; UX-B owns the federation rig (spec §36).

## 7. "Nothing is promoted to project truth"

**Claim.** A collaboration result is a projection. It is not evidence, not a proof
claim, not a decision and not project truth, and the composition does not mutate the
project.

**Mechanism.** `CollaborationResult != Evidence / ProofClaim / Decision`
(`src/interaction/result_view.ts:4-6`). The composition exposes no `reviseProjectIR`,
no task creation, no decision append and no journal write; it reads owners and
returns a view.

**Pinned by.** UXA-N19/N20 within the golden-run test: the ProjectIR head is
unchanged, and the Journal and open loops are byte-identical before and after. The
verification run that *does* persist is created by the existing
ProjectVerification owner, not by this layer.

**Falsify by.** Observing a ProjectIR revision, a new Journal entry, a Decision or
an open loop after a collaboration run.

## 8. "No autonomy change"

**Claim.** Collaboration does not change management involvement or the durable work
mode.

**Mechanism.** The durable preference is read as context only
(`src/interaction/collaboration.ts:173-177`); the write path is operator-only and
untouched. Management involvement is not addressed by the layer.

**Pinned by.** UXA-N02 (preference digest, base mode, modifiers and history
unchanged) and UXA-N03 (`involvement`, `profile`, `confirmationBoundaries`
unchanged).

**Falsify by.** Observing a new Work Mode history entry or a changed involvement
after a run.

---

## 9. What this does NOT claim

Read these as hard negatives. Each is a promise the product does **not** make.

```text
no cross-project collaboration yet   COORDINATE is a signal only; UX-B owns it (CF-UXA-03)
no Agent marketplace                 UX-A creates no durable agent at all
no autonomy change                   involvement and work mode are unchanged
no new truth                         a result is a projection, never evidence/proof/decision
no kernel fan-out governance         MAX_BRANCH_HINT = 8 is this layer's own bound (CF-UXA-01)
no AUTO capability without an advisor AUTO is always FOCUS on an install without org memory (CF-UXA-02)
no semantic classifier in the kernel  intent is typed; NL mapping is a host adapter (CF-UXA-04)
a malformed body is refused with 400  `CollaborationError.kind` feeds the shared mapper; `not_configured` stays 500 (pinned)
no web UI for UX-A                    the §42 web gates are regression gates only
no in-suite proof of UXA-N25…N30      those are full-suite/Playwright gate regressions (CF-UXA-12)
no closure of CF-AE-R-05              UX-A is local; federation is not composed (spec §36)
```

Additional honest notes a reader should weigh:

- ~~**`verifierRef` binds only under `CHECK`.**~~ **FIXED** (review MAJOR-3 + the
  earlier docs pass): the ref binds on every path that checks, and the regression now
  uses a MIXED verifier registry so a revert fails. The guarantees added by the review
  are:
  - **a non-independent verifier is never described as an independent check** — the
    summary only says "Independent verification ran" when the verification plane's own
    `independentVerifierRefs` names the protocol that actually ran; otherwise it states
    the class and says plainly that it does not count (review MAJOR-1);
  - **a repeated request is never credited with findings it did not admit** — findings
    come from the cell's current accepted frontier, and the summary distinguishes what
    THIS run admitted from what the same cell already held before the call, and names
    deduplicated branches instead of reporting "nothing unresolved" (review MAJOR-2).
- **`plan()` rejects on an infrastructure fault while `run()` returns an `ERROR`
  envelope.** Deliberate asymmetry: a read has no result envelope to fill, and a
  rejection is not a semantic verdict; the execution-kind vocabulary gained `"ERROR"`
  so an error envelope carries no structural verdict (`CF-UXA-13`).
- **`taskProfileOverrides` are inert for FOCUS and CHECK** — those intents never
  profile, so the overrides have nothing to refine (`CF-UXA-14`).
- **The advisor `preferences` argument is inert today** (`CF-UXA-07`).
- **AUTO cannot reach EXPLORE without a composed advisor** (`CF-UXA-02`).
- **The COORDINATE rule is tested for AUTO only** (`CF-UXA-09`).
- **No gate figures are certified by these documents**; gate runs are recorded by the
  stage author, never fabricated.

## 10. Honest limitations of this audit

- The audit covers text and code in this repository. It cannot bind an embedder that
  relabels the product.
- "PINNED" means a shipped test/mechanism makes the counter-claim fail against this
  revision; the rows cite the mechanism, not a spell-check.
- The suite is `test/uxa_collaboration.test.ts`. Where a claim is gate-level rather
  than in-suite, this page says so rather than borrowing a gate's authority.
