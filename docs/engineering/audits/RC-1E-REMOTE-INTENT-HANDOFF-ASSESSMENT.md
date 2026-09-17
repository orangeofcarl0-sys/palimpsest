# RC-1E §7 — Remote Collaboration Intent Handoff: assessment (RC1E0)

**Status:** RC1E0, written BEFORE any product change.
**Branch:** `experiment/rc-1-live-principal`, reconciled with canonical main
`b7fcb399c5630f29b94732569e1f91470d07dfda` (see §8/§10 below).
**Blocker under investigation:** RC-1R Scenario E — 5 judgeable trials, 0 passes, 0
authority/scope/disclosure violations: the remote live principal answered every Ask directly
and never used its own local collaboration.
**No product runtime is changed by this assessment.**

---

## 1. The 17 audit questions, answered from the code and the frozen evidence

| # | Question | Answer |
| --- | --- | --- |
| 1 | Which exact E prompt was sent? | `scripts/release/rc1-live-cross-project.mjs` → `E_PROMPT`: *"问一下 optics 项目：降低探测器孔径对接收稳定性的影响，有哪几种彼此独立的方案？请它给出多个独立思路，并分别说明各自成立的条件。"* No tool name, no intent, no ids (§23). |
| 2 | Did the remote receive the task text through `pending()`? | **Yes, in full.** The frozen `E#1` `pending` result carries `task: "降低探测器孔径对接收稳定性的影响，有哪几种彼此独立的方案？请给出多个独立思路，并分别说明各自成立的条件。"` plus `sourceProject`, `requestId`, `threadId`, `messageId`. Nothing about the task is hidden from the remote. |
| 3 | Was `palimpsest_collaborate` in the remote's actual catalogue? | **Yes.** The remote catalogue is 47 tools and contains `palimpsest_collaborate`, `palimpsest_cross_project`, `palimpsest_advisor`, `palimpsest_reasoning`, … (recorded per trial in `rawObservations.remote.principalCatalogue`). |
| 4 | Was `palimpsest_cross_project.respond(answer.compose)` available? | **Yes, and fully implemented.** `parseCrossProjectAnswerDraft` accepts `answer.compose = {task?, intent?}` with `intent` validated against `COLLABORATION_INTENTS = [AUTO, FOCUS, PARALLEL, CHECK, PARALLEL_AND_CHECK]`; `respond()` runs the project's existing `CollaborationService` (`compose.task ?? envelope.task`, `compose.intent ?? "AUTO"`) and derives the answer from its result through `answerFromCollaboration`. |
| 5 | Did any E trial use either path? | **No. 5/5 used neither.** Every `respond` call carried authored text: `args = ["action","answer","requestId"]` with `answer = {status, answer, detail}`; `answer.compose` appears in **0/5**. `palimpsest_collaborate` appears in the remote's tool names in **0/5**. |
| 6 | Did any E trial create a real ReasoningCell branch process? | **No.** `remoteBranchProcessCount = 0` and `branchCatalogues = []` in all five. |
| 7 | What exact attention text did the remote receive? | `[palimpsest cross-project] Another project is asking this project a question. Inspect the pending request and answer it using this project's context. A project you asked has replied. Receive the result and surface it to the user. Signalled by "detector-peer" (thread thr-cpq-…) about msg-73bee699-…. Use the palimpsest_cross_project tool: action "pending" for a request addressed to this project, or action "status"/"receive" for an answer to a question this project asked.` |
| 8 | Which local-collaboration cues are in that text? | **None.** The words Explore / parallel / independent approaches / multi-Agent / collaboration do not appear. The only named tool is `palimpsest_cross_project`. |
| 9 | Which local-collaboration cues are in the cross-project tool description? | Two, both weak. The main description says `respond` "…answers one of them on its own thread (use compose.{"task","intent"} to answer with this project's own local collaboration instead of authoring text)" — a parenthesis inside a ~1,600-character description. The `answer` property description says "…{status?:…, answer?, detail?} for authored text, or {compose:{task?,intent?}} to answer using this project's own local collaboration". **Nothing in the cross-project tool enumerates the intent vocabulary** (`PARALLEL` etc. are only discoverable from `palimpsest_collaborate`'s own schema), and **nothing states when compose should be preferred**. |
| 10 | Can the remote use `respond.compose` without new cross-project semantics? | **Yes.** It is an existing, strict-parsed, already-executed path. No protocol, store, event or authority change is needed. |
| 11 | Can the remote call `palimpsest_collaborate` without new semantics? | **Yes.** It is in the remote's catalogue and is the same local product path Scenario A qualifies. |
| 12 | Which path is simpler / less error-prone for a remote answer? | `respond.compose` is **one** product-level operation: the answer is derived by the product from the composed run, stays on the request thread, and needs no correlation step. The two-step path (`palimpsest_collaborate` then author the reply) is more informative to the answering principal because it can read the findings before writing, and it keeps expert control. Both are legitimate; the assessment does not privilege either (RC-1E §4). |
| 13 | Does a direct response remain valid for simple factual/history requests? | **Yes, and it was correct in Scenario D.** A history/lookup Ask should be answered from Project Workspace/history; forcing Explore there would be the §15/§22 anti-pattern. |
| 14 | Which oracle rule incorrectly equates local collaboration with a specific tool name? | `rc1-live-cross-project.mjs` → `remoteUsedCollaborate = remoteEvidence.toolNames.includes('palimpsest_collaborate')` (and the same value feeds the E gate in `test/support/rc1_oracle.ts`, `judgeCrossTrial`). It cannot see the `respond.compose` route at all. |
| 15 | What evidence proves actual local Explore occurred? | (a) real `branch-<uuid>` session directories created during the trial; (b) each branch's **own** `request/header.tools == ["palimpsest_branch_result"]`; (c) `≥2` such branches; (d) the product's own execution kind / typed `EXPLORATORY_CELL_LOCAL` standing when the result carries it; (e) a terminal answer actually sent, and the origin actually surfacing it. A tool name is not evidence of any of these. |
| 16 | What current-main changes from PR #116 must be preserved during rebase? | `test/global_setup.ts` (the run-scoped `palimpsest-*` temp sweep) and `vitest.config.ts` (`globalSetup: ["test/global_setup.ts"]`). Also the hygiene behaviour itself: `[test temp hygiene] removed N leaked temp dir(s)` must still appear and temp leakage must stay net zero. |
| 17 | *(added)* Does the shipped host tell the answering principal that a request is what it is? | **No — it cannot, and it says both things.** `inbound_peer_message` genuinely covers *both* directions (an answer arrives as an inbound peer message too), so the shipped runner calls `crossProjectAttentionText(signal, 'either')`, producing a text that tells the remote to *answer* **and** to *receive and surface*. The frozen `E#1` reasoning shows the cost: before it could start, the principal had to work out which half applied ("**No outbound Ask** from this project under that request id — there is no reply awaiting `receive`; the only live item is the inbound question, which I should answer"). The role default is honest (§11: the text must not classify), but the *request-side* wording is where the handoff must be repaired. |

### 1.1 Conclusion of the audit

The remote never used local collaboration for a reason that is visible in the product surface,
not in the model's willingness:

1. **The delivered attention text gives no collaboration cue at all**, and its "either"
   construction actively requires disambiguation before work can start.
2. **The one product path built for exactly this** (`respond.compose`) is documented only as a
   parenthesis inside a long description, its `intent` vocabulary is invisible from the
   cross-project tool, and no sentence says *when* to use it.
3. **The qualification oracle could not have seen the compose route even if it had been used**
   (question 14), so the measurement was tied to one tool name rather than to the behaviour.

None of the three is a kernel semantics problem. All three are the same class of defect RC-1
already fixed for the local case: truthful discoverability of capabilities that already exist.

---

## 2. What must NOT change (firewalls, restated with the audit's evidence)

| Rule | Evidence it is currently satisfied |
| --- | --- |
| `AttentionSignal != MessageContent` (UX-B SC-21) | the delivered text above contains routing metadata only; the remote obtained the task by calling `pending()`, not from the signal. |
| Attention text is not policy/authority/classifier (§11) | the formatter reads `peer`, `threadId`, `subjects` and a caller-supplied role, imports no store, and cannot fetch a body. |
| No automatic fan-out (§14/§15) | `pending()` performs no cognition; nothing opens a ReasoningCell from a signal. |
| `SimpleAsk != MustExplore` (§6) | Scenario D's history Ask was answered directly and must stay that way. |
| No new store / protocol species / commitment (§32/§33/§34) | `PROJECT_ASK`, `PROJECT_ANSWER`, `peer_message` and the Ask-≠-Commitment rules are untouched by any fix in this stage. |
| No extra local context on the wire (§35) | the outbound Ask still carries routing fields plus the exact task and any explicit `contextText`. |
| Expert tools stay visible (§36) | the remote sees the same shipped catalogue; nothing is hidden and no model name is special-cased. |
| Branch capability isolation (§19) | proven per branch session from its own `request/header`; any widening is a BLOCKER. |

---

## 3. Risk register

| id | Risk | Mitigation |
| --- | --- | --- |
| R-01 | Making the wording directive enough to pass E turns attention text into a policy/classifier | keep it conditional and capability-naming only; assert in tests that a simple request's guidance *permits* a direct answer, and that no semantic field (intent, status, branch count) is decided by the text |
| R-02 | The "either" role makes the improved request text bleed into answer-side handling | keep the assembly order and the answer clause intact; assert both appear for `either`, and that the request-side clause is what carries the collaboration cue |
| R-03 | `compose` guidance pushes every Ask into Explore, causing cost/pathology in D | guidance is conditional on the request explicitly asking for multiple independent approaches; D is re-measured and must stay qualified, with branch use reported |
| R-04 | The repaired E oracle could be satisfied by an *invocation* rather than real collaboration | E requires `≥2` observed branch sessions, each catalogue exactly `["palimpsest_branch_result"]`, plus a terminal answer and origin surfacing (RC-1E §19) |
| R-05 | `compose` resolving to FOCUS is mistaken for local collaboration | the oracle records `remoteCollaborationExecutionKind` and fails E unless a real Explore ran |
| R-06 | Changing the tool description breaks an existing contract test | the constants are exported and asserted via interpolation; the tool schema stays `additionalProperties`-free of new properties — only description text changes |
| R-07 | The rebase altered measured release semantics | verified: `git diff <pre-rebase> <post-rebase>` is EMPTY; ancestry includes `b7fcb399` |

---

## 4. Plan (what RC-1E will change, in order)

1. **Inbound attention text (§9/§10).** Restate `CROSS_PROJECT_INBOUND_REQUEST_TEXT` so an
   inbound request is a *normal request to this project*: inspect the pending request, read its
   task, handle it with normal project capabilities, and — only when it explicitly asks for
   parallel / multiple independent approaches / multi-Agent work / a local independent check —
   use this project's normal collaboration before responding, then answer through
   `palimpsest_cross_project`. The answer-side text is retained verbatim. `crossProjectAttentionText`
   keeps its shape: routing metadata only, no body, no store access.
2. **Cross-project tool description (§13/§16).** Make `respond.compose` first-class: state the
   two answer shapes explicitly, name the intent vocabulary, and state the conditional
   preference (prefer `compose` with `intent: "PARALLEL"`, or an equivalent explicit
   `palimpsest_collaborate` run, when the pending request asks for multiple independent
   approaches — never pretend a single authored answer was multi-Agent).
3. **E oracle (§18/§19/§20/§39).** Measure the *behaviour*: `remoteLocalCollaborationRoute ∈
   {NONE, COLLABORATE_TOOL, RESPOND_COMPOSE}`, plus execution kind, branch process count,
   branch catalogues, finding standing, response status and origin surfacing — raw call args
   kept separately from the judgement. E passes only with real packaged Explore branches.
4. **Deterministic proof first (§37/§38).** `RC1E-N01…N12` unit/integration tests and three
   frozen-evidence replay fixtures (`E-old-direct`, `E-explicit-collaborate`,
   `E-respond-compose`), so the live sample is not the first time the behaviour is exercised.
5. **Live gates (§43).** D ×5 (anti-regression, with branch use reported), E ×5, A ×1 smoke, on
   the same documented provider/model.
6. **Docs (§44).** `RC-1E-DELIVERY.md`, `RC-1E-CARRY-FORWARD.md`, and
   `release-evidence/rc1e-live-cross-project.json`; all earlier RC-1/RC-1R evidence preserved.

`CF-UXA-04` is **not** closed by this stage: AUTO remains a conservative lexical profiler that
selected FOCUS in 6/6 judgeable RC-1R AUTO trials, and RC-1E adds no model-backed profiler
(§27–§29). The release claim must not present AUTO as semantically solved.
