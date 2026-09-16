# UX-C — Carry-forward

Baseline: `a36d37b` (canonical main after UX-B).
Stage: **UX-C — Host-Native Zero-Config Collaboration Runtime** (product track).
Spec: `SPEC-PROMPT-UX-C.md` §54 (dispositions), §58 (after UX-C).
Dispositions of record: `docs/engineering/audits/UX-A-CARRY-FORWARD.md` §2 (`CF-UXA-*`),
`docs/engineering/audits/UX-B-CARRY-FORWARD.md` §2 (`CF-UXB-*`), and
`docs/engineering/audits/G10-AE-R-CARRY-FORWARD.md` §1 (`CF-AE-R-*`).
Evidence: `docs/engineering/audits/UX-C-HOST-RUNTIME-ASSESSMENT.md` (SC-1…SC-14),
`docs/engineering/audits/UX-C-BRANCH-OWNERSHIP-EVIDENCE.md`,
`docs/engineering/audits/UX-C-PACKAGED-DOGFOOD-EVIDENCE.md`,
`docs/engineering/audits/UX-C-HOST-RUNTIME-ANTI-WASTE.md`.

Every item below names a **concrete trigger**. Nothing here moves by assertion, and
nothing here is a delivered claim.

## 1. Closed by this stage — exactly four (§54)

### 1.1 `CF-UXA-02` — CLOSED_IN_UX_C

```text
CF-UXA-02 CLOSED_IN_UX_C
```

**Original finding** (`UX-A-CARRY-FORWARD.md` §2): *AUTO cannot choose EXPLORE without a
composed advisor* — the advisor was installed only when an organization-memory store was
supplied (`src/install.ts:1582-1585` at baseline), so on a plain install AUTO was always
FOCUS.

**Original trigger:** *a deployment that wants AUTO (or the §33 AUTO→EXPLORE scenario) on
an install without an organization-memory store — i.e. the first host that expects
automatic architecture selection without wiring org memory.*

**Why it is genuinely closed.** The trigger fired and was satisfied. The advisor is now
composed whenever its descriptive dependencies exist — a local peer, or an empirical
memory store — with `memory` omitted when there is none (`src/install.ts:1623-1640`).
With no memory it returns empty `empiricalSupport` and the honest rationale, and performs
no work by existing. Evidence:

| Proof | Evidence |
| --- | --- |
| advisor exists with no org-memory store | UXC-N01 (`test/uxc_host_runtime.test.ts:263`); `test/s_recipes.test.ts:351` |
| no empirical claim without memory | UXC-N02 (`:270-274`); local dogfood `memoryless_advisor_claims_no_empirical_evidence` |
| AUTO → EXPLORE without org memory | UXC-N04 (`:288`); local dogfood `memoryless_auto_selects_explore_for_a_decomposable_task` |
| AUTO → FOCUS for a coupled task | UXC-N03 (`:278`); local dogfood `memoryless_auto_selects_focus_for_a_coupled_task` |

**Cost preserved.** SC-1: `prefersExplore` also requires `verifiability = HIGH`, so the
dogfoods use a task containing a verifiability marker and the copy does not promise
EXPLORE from three features. `CF-UXA-04` (lexical profiler) is unaffected and stays open.

### 1.2 `CF-UXB-01` — CLOSED_IN_UX_C

```text
CF-UXB-01 CLOSED_IN_UX_C
```

**Original finding** (`UX-B-CARRY-FORWARD.md` §2.1): *a profile-launched deployment
composes no reasoning, so a remote project cannot fan out* — an EXPLORE/PARALLEL `compose`
answer request returned `CAPABILITY_REQUIRED`.

**Original trigger:** *a deployment whose `projectDirectory` names peers and which expects
a remote project to Explore — i.e. the first profile where an operator wants
`compose.intent` other than FOCUS to succeed, or the first decision to add a
reasoning-cell store / branch-execution port to `DeploymentProfile`.*

**Why it is genuinely closed.** The trigger fired and was satisfied. `DeploymentProfile`
now carries the additive `reasoning` bundle (`src/deployment/profile.ts:130-140`), the
launcher composes the deployment-owned store, the two exploratory policies and the
host-supplied branch port (`src/deployment/launch.ts:306-313`, `:418-432`), and a
packaged local Explore really runs. Evidence: UXC-N05/N06 (`:301`), UXC-N10 (`:410`),
UXC-N23 (`:669`); local dogfood `parallel_ran_real_ephemeral_branches`; cross-project
dogfood `b_packaged_local_explore_answered_the_ask`.

**What the closure does and does not claim.** It is closed for the **packaged DSH host**:
a profile with `reasoning: {}` can Explore with no manual wiring. The UX-B rig itself still
does not declare `reasoning: {}`, so its own honest note remains true for that rig
(`scripts/interaction/uxb-two-project-dogfood.mjs:462-470`). No generic host-neutral
kernel change was made; the closure is packaging.

### 1.3 `CF-UXB-02` — CLOSED_IN_UX_C

```text
CF-UXB-02 CLOSED_IN_UX_C
```

**Original finding** (`UX-B-CARRY-FORWARD.md` §2.2): *`crossProjectAttentionText` was
exported and tested but the shipped DSH runner did not use it.*

**Original trigger:** *the first DSH/Pi host that wants a woken principal to be told
"another project is asking…" rather than shown the generic inbound-peer signal.*

**Why it is genuinely closed.** The shipped runner now formats inbound peer signals with
the PRODUCT text and everything else with the default formatter
(`host/dsh/lib/runner.js:205-208`), and `src/advanced.ts` re-exports the interaction layer
so the host entry can reach it (SC-8). Evidence: UXC-N16 (`:530`); cross-project dogfood
`b_attention_uses_the_product_cross_project_text`,
`a_attention_uses_the_product_cross_project_text`. The formatter reads only routing
metadata — an `AttentionSignal` has no body field — so no peer-message content can appear
in the text (UXC-N17, `:531-547`).

### 1.4 `CF-UXB-03` — CLOSED_IN_UX_C

```text
CF-UXB-03 CLOSED_IN_UX_C
```

**Original finding** (`UX-B-CARRY-FORWARD.md` §2.3): *the shipped runner's attention
adapter supplied `get()` but no `resume()`, so the cold-resume branch was unreachable
there.*

**Original trigger:** *a DSH/Pi host that expects a cold project principal to be resumed
by an inbound peer message rather than only at process start.*

**Why it is genuinely closed.** The runner now wires the real resume-capable `agents`
service into the EXISTING activation adapter (`host/dsh/lib/runner.js:214-230`); the
persisted session id comes from the host/session binding, never a `PeerRef`; a failed
resume returns `activated: false` and leaves the signal pending. Evidence: UXC-N18
(`:556`), UXC-N19 (`:576`); cross-project dogfood
`cold_resume_get_undefined_resume_called_followup_queued`,
`successful_activation_marks_the_signal_delivered`,
`failed_activation_leaves_the_signal_pending`.

**Boundary retained.** This is cold-resume of a persisted session **inside a running
host**; OS-level daemon resurrection remains out of scope (§41; new item below).

## 2. `CF-UXB-08` — already closed, not re-closed

`CF-UXB-08` (`projectPhrase` article-doubling) was **CLOSED IN UX-B (gate review M4)**
(`UX-B-CARRY-FORWARD.md` §2.8). UX-C does not touch `projectPhrase` and does **not**
re-close it; it is restated here only so this document does not silently re-open a closed
item. Its regression in `test/uxb_cross_project.test.ts` remains the pin.

## 3. Kept open — triggers unchanged

These items are **unchanged** by UX-C. The disposition of record is the original document;
the trigger below is reproduced so this stage does not silently widen or drop it.

| ID | Finding (abbreviated) | Trigger (unchanged) | UX-C's effect |
| --- | --- | --- | --- |
| `CF-UXA-01` | the kernel has **no branch ceiling**; `MAX_BRANCH_HINT = 8` is the product layer's own bound | a second product face or an expert caller that wants to request a branch count, or a decision to move fan-out governance into the kernel | **none.** UX-C keeps the bound and adds no ceiling (anti-waste §13.1) |
| `CF-UXA-04` | the deterministic profiler is **lexical** (explicit keyword markers only) | a host that wants model-backed profiling, or a measured all-UNKNOWN sentence that should have explored | **none.** UX-C adds no profiler |
| `CF-UXA-10` | UX-A reads the advisor's blocker wording by regex; a **typed blocker code** does not exist | any change to the advisor's blocker wording, or the introduction of a typed capability/blocker code | **none.** UX-C reads no advisor text |
| `CF-UXB-04` | the §10 fuzzy project resolver seam is unwired (no shipped deployment supplies one) | a host that wants a user to name a project fuzzily, or a measured case where exact resolution fails and no alias exists | **none.** exact `projectId`/displayName/alias resolution remains the baseline |
| `CF-UXB-05` | the product maxima (`CROSS_PROJECT_MAX_*`) are UX-B's own bound | a real request/answer that exceeds a bound, or a decision to move body governance into the kernel | **none.** the maxima are untouched |
| `CF-UXB-06` | `pending()` throws when the directory cannot be observed (asymmetric with `projects()`) | the first host that polls `pending()` in a loop, or a request to make it return a state envelope | **none.** the shipped runner does not poll `pending()`; the asymmetry remains |
| `CF-UXB-07` | a repeated identical Ask is a NEW transport message (random `messageId`) | a measured cost where repeated identical Asks matter, or a decision to make `messageId` content-addressed | **none.** the protocol is untouched |
| `CF-UXB-09` | the optional answer gate (`domainGate`) is declared but unwired | a deployment that must refuse to answer foreign questions (compliance, offline, maintenance) | **none.** UX-C deliberately does not wire a default gate (§28) |
| `CF-AE-R-08` | concurrent writers to one shared physical file remain unsupported (unchanged) | two installations writing the same physical file concurrently | **none.** UX-C's rigs serialise their writes |
| PIAS | the separate Personal Intellectual Asset System track | a separate product/data track, not a UX-C dependency (§54/§58) | **none.** no PIAS scope (anti-waste §11) |

HONEST: the spec also lists `CF-UXB-05`…`CF-UXB-07` as "keep open unless trigger fires";
UX-C has no evidence about any of them and does not dispose them.

## 4. New carry-forward items surfaced by this stage

### 4.1 OS-level project daemon / auto-start

UX-C proves cold-resume of a persisted agent session **inside a running host**, not
starting a host that is not running (§41). A project answers only while its host process
is alive.

**Trigger:** a host that must wake a principal when no process is running (after a
machine reboot, or an operator who expects a project to answer overnight with no host
running) — i.e. the first deployment that needs OS service management rather than an
in-host loop.

**Kind:** packaging/deployment, not a kernel species.

### 4.2 A live-principal packaged proof

The packaged dogfoods drive the lifecycle in-process and spawn real DSH branch
subprocesses, but never a live model-driven principal turn
(`UX-C-PACKAGED-DOGFOOD-EVIDENCE.md` §4).

**Trigger:** any change to the shipped runner's scheduling or activation wiring, or the
first CI/host environment able to run a model-driven DSH principal — whichever comes
first, so the shipped runner's claims can be upgraded from structural to end-to-end.

### 4.3 Finding-specific independent verification

CHECK verifies the exact current Project Head. There is **no** finding-specific verifier,
and no copy may imply one (`SPEC-PROMPT-UX-C.md` §14; UXC-N15).

**Trigger:** a product need to tell a user that specific Explore findings were verified —
which first requires a real finding-specific verifier that does not exist — or any copy
change that would otherwise imply it.

### 4.4 Host cost / budget presets

UX-C ships no budget preset: branch fan-out is bounded by `MAX_BRANCH_HINT = 8`
(`CF-UXA-01`) but there is no packaged bound on token/verification/cross-project spend.

**Trigger:** a deployment that must bound collaboration spend (a cost ceiling, a metered
environment), or a measured cost incident where an unconfigured project explored or asked
more than the operator wanted.

### 4.5 The DSH host persists a branch session artifact

Found by the gate review (F2). Every branch leaves
`$DSH_HOME/sessions/<cwd-key>/branch-<id>/session.v3.jsonl.zstd` containing the session
header and, for a branch that ran turns, `request/header`, `assistant/message`, `tool/call`
and `tool/result`. No Palimpsest semantic store is written by a branch, and the branch is
restricted to one tool — but the host artifact is durable, so "ephemeral branch" is true of
the *semantic* layer and not of the host's own session files. The earlier "never persisted"
claim was false and is corrected in `UX-C-HOST-RUNTIME-ANTI-WASTE.md`.

**Trigger:** a deployment with a disk-retention or confidentiality requirement for branch
artifacts, or a DSH host API that can disable session persistence per agent.

### 4.6 The cold-resume proof does not execute the runner's own wiring

Found by the gate review (F5). `resume` IS wired into the shipped runner and the adapter
contract is proven with a stub through `pumpAndActivate()`, but no test drives `runner.js`'s
adapter construction, and in a live runner `agents.get(sessionId)` resolves for the session
it just created, so the cold branch is not exercised there.

**Trigger:** a host refactor that exports the runner's activation-adapter construction, or a
first real cold-resume in production.

### 4.7 One reasoning service serves recipe Explore and evidence extraction

Found by the gate review (F9, latent). `src/install.ts` composes ONE `ReasoningCellService`
with the first-party exploratory policies and hands the same service to the evidence
extraction service, whose cells use evidence-grounded policy refs; the exploratory
verification policy refuses a non-recipe ref, so an extraction cell would report
`verification_error`. Not reachable today (a launched deployment wires no proof store, so
extraction is `undefined`).

**Trigger:** the first packaging step that wires a Proof store into a launched deployment.

### 4.8 The frozen pre-UX-C header comment in `src/reasoning_cell/branch_execution.ts`

Landed by the gate review as F7 and deliberately **NOT** fixed. The module header still says
the host "may ONLY read the frozen brief and submit structured candidates through the REAL
ReasoningCell service (submit_candidate)", which describes the pre-UX-C contract. Correcting
it is a one-comment change, and the first attempt was made — but the AD campaign's frozen-plane
test (`test/ad_verification_integration.test.ts`, AD-N30/§27) asserts that **no other plane
changed**, source-level, by comparing `src/reasoning_cell/**` against the AD baseline. That
firewall exists precisely so a later product stage cannot quietly rewrite an earlier semantic
plane, so the comment stays and the authoritative new contract is documented where UX-C owns
it: `src/deployment/branch_host.ts` and `host/dsh/lib/runner.js`.

**Trigger:** the next stage that legitimately opens the reasoning plane, or a decision to
relax the AD source-identity test to ignore comments.

## 5. What UX-C does NOT leave open

Delivered and pinned; not carried:

```text
packaged local Explore with no manual reasoning wiring    UXC-N05/N06/N10; local dogfood
memoryless Advisor + AUTO Focus/Explore                    UXC-N01…N04; local dogfood
branch is a capability-restricted result adapter           UXC-N07/N08/N09; local dogfood
one candidate owner, cited refs forwarded                  UXC-N10; branch-ownership evidence
INCONCLUSIVE standing, no invented evidence               UXC-N11/N12/N13
typed exploratory finding label in primary text            UXC-N13; local dogfood
CHECK is project-head verification                          UXC-N14/N15
product attention formatter + real resume                  UXC-N16…N19; cross-project dogfood
one lifecycle owner (schedule, not re-implement)           UXC-N20; host runner
explicit cross-project send                                UXC-N21/N22
packaged remote Explore / FOCUS answer                     UXC-N23/N24; cross-project dogfood
zero hidden work at idle                                   UXC-N26/N27
restart preserves semantic owners                          UXC-N28
no new store / event / agent / authority / species         anti-waste §1–§12
```

## 6. After UX-C (§58)

> Do NOT automatically add another semantic capability.
> At that point the core product promise should work through the shipped DSH path:
> one request → local multi-Agent collaboration; one request → another project's
> principal → optional local collaboration there → answer back.
> Then choose only from real friction.

The candidates, to be chosen from real friction and not scheduled:

```text
UX-D — Cross-Project Delegation & Durable Commitments
UX-D — Multi-Project Ask + Result Synthesis
UX-D — OS-level Project Daemon / Auto-Start
UX-D — Finding-Specific Review/Verification
PIAS-A0 — separate Personal Intellectual Asset System
```

UX-C is the third stage under the track rule

```text
NO NEW KERNEL SEMANTIC SPECIES
unless a real interaction use case proves the existing kernel cannot express it.
```

and it honours it: three new packaging modules, one derived view, one host bundle
rewired, **zero** changes to `src/coordination/**`, `src/transport/**`,
`src/federation/**`, `src/attention/**` or `src/project_workspace/**`. Every open item
above is a **host capability** (`CF-UXB-01` closed; the new daemon and live-principal
items), a **wiring decision** (`CF-UXB-04`, `CF-UXB-09`), a **cost** (`CF-UXA-01`,
`CF-UXA-04`, `CF-UXB-05`…`CF-UXB-07`, `CF-UXA-10`), or a **held disposition** — none
proposes a new kernel species, and none is a defect.
