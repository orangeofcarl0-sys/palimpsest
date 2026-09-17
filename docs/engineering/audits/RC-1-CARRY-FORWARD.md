# RC-1 — Carry-forward reassessment

Baseline: `6c7181d66816a70cb41583be00e0676e56fce06d` (canonical main after UX-C).
Spec: `SPEC-PROMPT-RC-1.md` §42. This document reassesses the carry-forward list against
what the RC-1 live trials actually measured. Nothing closes without evidence; nothing is
kept open merely out of habit.

---

## 1. UX-C new 4.2 — live-principal packaged proof → **CLOSED_IN_RC1**

UX-C's §4.2 said the packaged dogfoods never ran a live model-driven principal turn.
RC-1 ran real model-driven DSH principals over the shipped host (no scripted principal, no
direct `application.*` call standing in for the model) and qualified the product path:

- local parallel / AUTO Explore / current-project CHECK / English smoke: see
  `release-evidence/rc1-live-local.json`;
- cross-project Ask with two live principals: see `release-evidence/rc1-live-cross-project.json`.

The observed `request/header.config` on every trial is the configured
`openrouter-stealth` / `stealth/union-alpha`. This closes the *packaged proof* item for
this one supported configuration (§12); it does **not** generalise to other models.

## 2. UX-C new 4.6 — cold-resume evidence gap → **OPEN (unchanged)**

RC-1 did not naturally exercise a cold resume of a dead principal session: the shipped
runner's activation adapter resolves the resident session it created (`agents.get`), so
the `resume` branch still is not driven by a live path. Nothing was restructured to force
it. Trigger unchanged: a host refactor that exports the runner's activation construction,
or a first real cold resume in production.

## 3. UX-C new 4.4 — host cost / budget presets → **OPEN (first real data recorded)**

RC-1 recorded per-trial wall-clock, principal tool-call count, branch process count,
cross-project message count and verifier run count; the host exposes **no** token
accounting, so none is invented (§31). No pathological fan-out was observed. Trigger
unchanged: a deployment that must bound collaboration spend, or a measured cost incident.

## 4. UX-C new 4.5 — the DSH host persists a branch session artifact → **OPEN (facts recorded)**

RC-1 measured the branch artifacts instead of deleting them (§30):
`release-evidence/rc1-live-principal.json` → `branchArtifactRetention` (path, approximate
size, data classes). Nothing was deleted. Trigger unchanged: a disk-retention or
confidentiality requirement for branch artifacts, or a DSH API that disables per-agent
session persistence.

## 5. UX-C new 4.7 — shared reasoning-service / Proof coupling → **OPEN (unchanged)**

No launch profile in RC-1 wires a Proof store, so the latent coupling is still
unreachable. RC-1 deliberately did not wire Proof just to exercise it (§43). Trigger
unchanged: the first packaging step that wires a Proof store into a launched deployment.

## 6. CF-UXA-04 — lexical profiler → **OPEN, trigger now genuinely FIRED**

AUTO still selects Explore only when the task text carries the profiler's markers, and the
packaged `TASK_PROFILER_RULES` are **English-only lexical markers**
(`src/interaction/host_adapter.ts`). RC-1's Scenario B prompt is ordinary Chinese
(`先判断这个问题是否值得并行探索，再按合适方式分析：比较两个彼此独立、可单独验证的缓存策略。`)
and contains none of those markers, so the profiler leaves the features UNKNOWN and the
advisor honestly falls back to FOCUS (`PRINCIPAL_CONTINUES`) instead of Explore.

That is exactly CF-UXA-04's stated trigger — *"a measured case where a real user sentence
profiles to all-UNKNOWN and AUTO therefore stays FOCUS when EXPLORE was warranted."* RC-1
records the measurement and does **not** close the item: RC-1 adds no profiler and no new
kernel behaviour (§37), and a model-backed profiler is a capability change outside this
release-qualification stage. It becomes the leading candidate for the next stage (§51
"model-backed task profiler"). UX-C's own note ("AUTO chooses Explore only when the task
text actually carries the profiler's markers… A paraphrase with no marker stays Focus")
is confirmed on a live principal.

## 7. CF-UXB-04 — fuzzy project resolver → **OPEN (unchanged)**

Cross-project resolution stayed exact (`projectId` / `displayName` / `alias`). RC-1 did
**not** enable a fuzzy/model resolver (§25). In the live trials the model derived the
`optics` alias correctly from the sentence. Trigger unchanged: real trials showing exact
resolution is insufficient.

---

## 8. New findings from RC-1 (things that were real)

### 8.1 An attention-driven turn was neither observable nor reliably durable

The shipped runner delivered activation turns with `followup` (fire-and-forget) and never
flushed or reported them: the harness could not see the activated principal's final
visible text, and the turn could be lost until process exit. RC-1 added a minimal,
semantics-neutral step to `host/dsh/lib/runner.js`: after a successful activation it waits
for the queued turn, flushes the session and prints the same `PALIMPSEST_TURN` record it
already prints for a launch turn. No authority, capability or semantic species was added.
**Disposition:** fixed in RC-1 (release-blocking for "observable evidence only", §11).

### 8.2 A long-running host's stdout is not a reliable evidence channel

`PALIMPSEST_ACTIVATION` / `PALIMPSEST_TURN` lines were intermittently absent from a
long-running principal's stdout, while the same facts were durably present in the DSH
session artifact. The live harnesses therefore read the persisted session (tool calls,
tool results, delivered user messages, assistant text) as the primary evidence and treat
stdout only as supplementary. This is a harness design consequence, not a product defect.
**Disposition:** recorded; harness reads the durable artifact.

### 8.3 Activation is an inbox splice, not a new top-level turn

The DSH agent splices an attention followup into the existing agent turn
(`agent/inbox/spliced`) and reuses the same `turn` index, so "a later turn" cannot be
detected by `data.turn`. It is detected by sequence position after the **terminal** answer
outcome and by the delivered product attention text.
**Disposition:** recorded; harness detection updated.

**CORRECTED_IN_RC1R:** the original text said "after the `ANSWERED` receive". That wording
encoded the very defect RC-1R had to repair: the initial oracle accepted only
`status === "ANSWERED"`, while `deriveView()` treats `ANSWERED | PARTIAL | DECLINED |
REMOTE_ERROR` as terminal and `receive()` consumes and ACKs any of them. The frozen
cross-project trial *did* ingest a terminal `PARTIAL` answer and *did* present it on a later
turn, and it was scored `REMOTE_RESULT_NOT_SURFACED` (RC-1R FN-1). Surfacing is now derived
from the product's own derived status. See
`RC-1R-QUALIFICATION-ORACLE-ASSESSMENT.md`.

### 8.3b The activation record was not newline-framed (RC-1R §5)

The runner change described in 8.1 wrote `PALIMPSEST_ACTIVATION {…}` **without a trailing
newline**. When the activated turn's `PALIMPSEST_TURN {…}` followed immediately, both
records shared one physical line, and a `line.startsWith(...)` parser lost the activation
*and* the turn. Observed: an origin session with three assistant messages across turns
1,1,2 produced a single `stdoutTurns` entry. RC-1R restores the newline and gates on the
malformed-record count (§27).

### 8.5 The pre-repair verifier for Scenario C required a happy path (RC-1R FN-4)

The frozen RC-1 local bundle stores `MODEL_TASK_QUALITY_FAILURE` for its single Scenario C
trial, whose observation is a correct high-level CHECK route with a truthful
`project_head_not_materialized` blocker. The committed `judge()` returns `PASS` for that
same observation, so the released evidence and the released oracle came from different
revisions. Either way the measurement was wrong in one of two directions: it either
required a recorded verification *run* (so a correctly routed, honestly blocked CHECK read
as a "model failure") or it could not distinguish routing from verifier success at all.
RC-1R splits C into C1 (routing + blocker honesty) and C2 (a recorded run against a head
materialized through the supported `controller.start({ …, headCommit })` path).

### 8.6 An explicit request for parallel exploration could pass without any branch (RC-1R FP-8)

`A_local_parallel` / `EN_local_parallel` accepted `executionKind ∈ {LOCAL_EXPLORE,
LOCAL_EXPLORE_AND_VERIFY}` — the product's own statement about itself — without requiring a
single observed branch session, so §21's "real packaged branches" was never checked. RC-1R
requires an observed `branch-<uuid>` session whose own catalogue was read from its artefact,
and refuses a trial that reports Explore with none.

### 8.7 Scenario E was measured but never gated (RC-1R FP-1)

The cross-project criteria block computed `scenarioE_remote_used_collaborate` as a
*statistic* and required nothing of it. The frozen bundle shows the single Scenario E trial
classified `PASS` with `scenarioE_remote_used_collaborate: 0` — the remote principal
answered directly and never used its own local collaboration, which is the one thing §18's
Scenario E exists to qualify. RC-1R gates E on a real remote `palimpsest_collaborate` call.

### 8.8 `surfacedText` preferred the launch turn over the final answer (RC-1R FN-2)

`surfacedText = surfacing.text || stdoutText || finalAssistantText` put the *last stdout
turn* ahead of the session's *final assistant message*. For a trial whose answer arrived on
an activated turn, every disclosure, invention and commitment check therefore ran against
the launch turn's "still waiting" text — and that wrong string was persisted as the
bundle's `surfacedText`. RC-1R records both texts and judges the visible answer on the
final assistant message.

### 8.4 A product request id can appear in the principal's prose

In several cross-project trials the origin principal echoed the cross-project request id
(`cpq-…`) in its user-visible text. This is the handle the product returns so the agent can
poll `status`/`receive`, not a peer/thread identity; it is recorded separately
(`surfacedRequestId`) rather than treated as a disclosure violation. It is a minor §22
"hide internal ids by default" hygiene observation.
**Disposition:** recorded; candidate for a future copy-guidance trigger (do not special-case
this stage).

---

## 9. RC-1R §35 — reassessment after the corrected full sample

Reassessed **only** from the measured RC-1R evidence
(`release-evidence/rc1r-live-principal.json`). Nothing below is promoted because RC-1R exists.

| Item | Trigger state after RC-1R | Disposition |
| --- | --- | --- |
| **CF-E-01 (NEW) — the answering project does not reach for its own collaboration** | **FIRED, with a reproducible live sample.** Scenario E: 5/5 trials had a correct Ask → activation → answer → surfacing, and `remoteCollaborate: false` in all five. The remote principal's own recorded rationale was that its stores are empty, and the delivered attention text frames an inbound Ask as "answer it using this project's context" while naming only `palimpsest_cross_project` actions. | **OPEN — this is the sole RC-1R blocker.** The remedy is a product-surface description/formatting change of the same kind RC-1 §9 already made for the local case (no kernel semantics, no new capability). It needs its own small stage and its own live E sample. |
| **CF-UXA-04 — lexical profiler** | **Trigger still FIRED, evidence strengthened.** After the RC-1 tool-description rebase, the AUTO Advisor selected FOCUS in **6/6** judgeable AUTO trials on a prompt written as a decomposable, separately-verifiable task. The AUTO route itself was exercised correctly and executed faithfully; the EXPLORE *selection* was not observed. | OPEN, unchanged mechanism (English-only lexical markers). The repaired oracle no longer turns this into a false `MODEL_TASK_QUALITY_FAILURE`, so it can be measured honestly from now on. |
| UX-C 4.6 — cold-resume runner proof | Not exercised: every live trial created its session, and the shipped adapter resolved the resident session it created. | OPEN, trigger unchanged. |
| UX-C 4.4 — host cost / budget presets | First real budget data recorded: local trials 14–429 s, cross trials 96–418 s, one AUTO Focus trial exited at 317 s with no answer. Token accounting is still not exposed by this host. One trial (16 s, exit 0) produced **no assistant message and no tool call at all** — provider instability, classified as `INFRASTRUCTURE_ERROR` and retained. | OPEN. No pathological fan-out; no cost claim is made. |
| UX-C 4.5 — branch session artifact retention | 20 branch sessions created and read during the sample; every catalogue exactly `["palimpsest_branch_result"]`. Nothing deleted. | OPEN, facts recorded (`branchArtifactRetention`). |
| UX-C 4.7 — shared reasoning service / Proof packaging | No profile wired a Proof store; the latent coupling remains unreachable. RC-1R did not wire Proof to test it. | OPEN, trigger unchanged. |
| CF-UXB-04 — fuzzy project resolver | Exact resolution (`alias`/`displayName`) worked in **10/10** cross-project trials; the model derived the `optics` alias from ordinary sentences every time. One trial needed an `ask` retry because the model first omitted the target, and the product refused that call rather than guessing — correct behaviour. | OPEN, trigger unchanged. |
| Finding-specific verification | No trial produced evidence that a finding-level verification target is needed. | OPEN, no evidence. |

---

## 10. What does **not** carry forward

- No new kernel semantic species, authority plane, Agent identity or hidden autonomy was
  introduced (spec §46 RCP-A01…A03).
- No Proof store, fuzzy resolver or OS daemon was added (§25/§28/§43).
- Expert tools, raw federation tools, ReasoningCell tools and the Work CLI remain
  registered and documented.
