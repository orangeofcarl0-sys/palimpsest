# RC-1E — Remote Collaboration Intent Handoff & Release Closure: delivery

**Baseline:** canonical main `b7fcb399c5630f29b94732569e1f91470d07dfda` (PR #116 merged); the RC
branch was reconciled onto it before any product change (§8), with the pre-rebase tree
preserved byte-identically.
**Companion documents:** `RC-1E-REMOTE-INTENT-HANDOFF-ASSESSMENT.md` (RC1E0, the mandatory
pre-implementation audit), `RC-1E-CARRY-FORWARD.md`, and the corrected RC-1/RC-1R records.
**Evidence:** `release-evidence/rc1e-live-cross-project.json` (D + E, raw observations and
re-derived judgement per trial), `rc1e-live-cross-project-d.json` / `-e.json` (the two gate
runs), `rc1e-live-local-smoke.json` (the A smoke), `rc1e-interrupted-trial-evidence.md`.

---

## 0. Verdict

> ## `PALIMPSEST RC-1E REMOTE COLLABORATION INTENT HANDOFF & RELEASE CLOSURE: PASS`

Scenario E now passes **5/5** with real packaged local collaboration on the remote side, using
the product's own existing composition path and no new kernel semantics. Scenario D remains
qualified **5/5** and still accepts a direct answer with **zero** remote branch fan-out. Zero
authority/scope/disclosure violations. All automated gates and dogfoods green.

`CF-UXA-04` (AUTO's conservative lexical profiler) remains **explicitly OPEN** and is not
presented as solved.

---

## 1. What was wrong, and what changed

RC-1R's corrected oracle had already established the truth: in 5/5 E trials the transport,
activation, remote answering and origin surfacing all worked, and the remote principal simply
never used its own collaboration. The RC1E0 audit traced that to the product surface, not to
model willingness, and found three separable causes:

| # | Cause (audit §1.1) | Change |
| --- | --- | --- |
| 1 | The delivered inbound attention text gave **no collaboration cue at all**, and its "either" construction told the answering principal both "answer it" and "receive and surface it", forcing disambiguation before work could start | The request-side text now makes an inbound Ask a **normal request to this project** and states, conditionally, that a task which explicitly asks for parallel / multiple independent approaches / multi-Agent work should go through this project's own collaboration capability first |
| 2 | `respond(answer.compose)` — the path built for exactly this — was documented only as a parenthesis inside a long description, and the intent vocabulary was invisible from the cross-project tool | The tool description and the `answer` property now state the two answer forms explicitly, name the `AUTO\|FOCUS\|PARALLEL\|CHECK\|PARALLEL_AND_CHECK` vocabulary, say when compose is the right choice, and restate that a composed run's findings are exploratory |
| 3 | The qualification oracle equated local collaboration with one **tool name**, so the compose route could never have been seen | E is now measured **semantically**: `COLLABORATE_TOOL` or `RESPOND_COMPOSE`, and only a **real packaged Explore** (≥2 branch sessions, each capability-isolated) counts |

No new store, protocol type, Agent identity, authority or kernel semantic species was
introduced (§32/§33/§34). The formatter still reads routing metadata only and embeds no
message body (§12/SC-21), nothing runs cognition from a signal or from `pending()` (§14), and
no Ask is silently rewritten to PARALLEL (§15).

---

## 2. Measured result (one supported configuration, §43)

provider `openrouter-stealth` / model `stealth/union-alpha`, observed per trial in the
principal's own `request/header.config`; Node `v24.14.1`; `win32 x64`. No token accounting is
exposed by this host and none is invented.

| Scenario | launched | judgeable | passes | required | qualified | infra |
| --- | --- | --- | --- | --- | --- | --- |
| **D** cross-project Ask (history/lookup) | 5 | 5 | **5** | 4 | ✅ | 0 |
| **E** cross-project Ask → remote local collaboration | 5 | 5 | **5** | 4 | ✅ | 0 |
| **A** local parallel smoke (§26) | 1 | 1 | **1** | 1 | ✅ | 0 |

### 2.1 Scenario E — what actually happened

| trial | route | compose intent | remote branches | catalogues | terminal | surfaced |
| --- | --- | --- | --- | --- | --- | --- |
| E#1 | `RESPOND_COMPOSE` | `PARALLEL` | 2 | isolated | `ANSWERED` | ✅ |
| E#2 | `RESPOND_COMPOSE` | `PARALLEL` | 2 | isolated | `ANSWERED` | ✅ |
| E#3 | `RESPOND_COMPOSE` | `PARALLEL` | 2 | isolated | `ANSWERED` | ✅ |
| E#4 | `RESPOND_COMPOSE` | `PARALLEL` | 2 | isolated | `ANSWERED` | ✅ |
| E#5 | `RESPOND_COMPOSE` | `PARALLEL` | 2 | isolated | `ANSWERED` | ✅ |

Every trial: the remote read the task through `pending()`, chose **its own** local
collaboration through the documented compose path, ran real ephemeral branches, sent a
terminal answer over the unchanged UX-B thread, and the origin surfaced it on a later
attention-driven turn with **no second user prompt**. 10 real branch sessions were observed
across the sample and **every** catalogue was exactly `["palimpsest_branch_result"]`
(`widened: false`, proof established — not vacuous).

Exploratory truthfulness held (§21): the remote's own answer text carried
"Local Explore produced exploratory findings … Those findings are cell-local hypotheses", the
result carried the typed `EXPLORATORY_CELL_LOCAL` standing, and the origin's surfaced summary
repeated that they are exploratory and not independently verified — while adding its own
critical caveat about one of the findings, which is exactly the behaviour a truth-preserving
handoff should produce.

### 2.2 Scenario D — the anti-regression that matters

D is a **history/lookup** Ask ("did we study this before?"). All five trials:
`remoteLocalCollaborationRoute: NONE`, `remoteBranchProcessCount: 0`, terminal
`ANSWERED`/`PARTIAL`, surfaced without a second prompt. **The new guidance did not push a
simple request into unnecessary fan-out** (§22/§41): the conditional wording plus the
two-form tool description were enough for the principal to answer directly, and D reports the
route it took without requiring one.

---

## 3. Deterministic proof before live calls (§37/§38)

| id | what it pins |
| --- | --- |
| RC1E-N01 | the inbound instruction treats the pending task as a normal request to this project |
| RC1E-N02 | the attention text still carries no message body and depends only on routing metadata |
| RC1E-N03 | simple-request guidance **permits** a direct answer |
| RC1E-N04 | explicit-parallel guidance names local collaboration, **conditionally**, and decides no semantics |
| RC1E-N05 | the cross-project tool exposes both answer forms, the intent vocabulary and the conditional preference |
| RC1E-N06 | `answer.compose` accepts every `CollaborationIntent` and refuses anything else (and refuses compose+authored together) |
| RC1E-N07 | the oracle recognises the `palimpsest_collaborate` route |
| RC1E-N08 | the oracle recognises the `respond(answer.compose)` route — with **no** collaborate call present |
| RC1E-N09 | a direct single-principal answer is not local collaboration, however good it reads |
| RC1E-N10 | an invocation without real branches fails E (no branches; FOCUS; zero-branch compose) |
| RC1E-N11 | every remote branch catalogue must stay exactly `["palimpsest_branch_result"]` |
| RC1E-N12 | D still accepts a direct answer, and the route is reported even when it is `NONE` |

Three §38 replay fixtures, one of which is **real frozen evidence**:
`E-old-direct` (the frozen RC-1R E trial, read from its stored observations → FAIL),
`E-explicit-collaborate` (→ PASS), `E-respond-compose` (→ PASS, proving the oracle is no longer
tied to one tool name). The oracle's raw-observation adapter is shared with the evidence
composer, so the two cannot drift.

---

## 4. Gates (§42) and live gates (§43)

| Gate | Result |
| --- | --- |
| `git diff --check` | clean |
| `pnpm build` (`tsc -b`) | clean |
| `pnpm exec vitest run --maxWorkers=2` | **170 files / 1915 tests passed** (baseline 168/1897) |
| `pnpm run build:web` | exit 0 |
| `pnpm exec playwright test --retries=0` | **36 passed** |
| `uxc-dsh-local-dogfood` | pass |
| `uxc-dsh-cross-project-dogfood` | pass (the RC-1R branch-subprocess flake did **not** recur in this stage's run; the RC-1R occurrence stays recorded in `RC-1R-DELIVERY.md`) |
| `uxb-two-project-dogfood` | pass |
| `uxa-dogfood` | pass |
| `aer-boundary-dogfood` | pass |

Live: D ×5, E ×5, A ×1 smoke — see §2. The first cross-project run was killed by an invoking-shell
interruption after D completed; its E#1 evidence is retained separately
(`rc1e-interrupted-trial-evidence.md`) and is **not** part of the sample.

---

## 5. What PASS claims, and what it does not

**It claims:**

* an ordinary user sentence asking another project for **several independent approaches** now
  reaches that project's own local multi-Agent collaboration through the existing product
  surfaces, with real packaged branches, a terminal answer on the existing UX-B thread, and a
  surfaced summary — in 5/5 fresh trials, with zero violations;
* a **simple** cross-project question is still answered directly, with no branch fan-out (5/5),
  so the fix is an adaptation, not a universal fan-out rule;
* the qualification measures the **behaviour** (both legal routes count; real branches are
  required), not the spelling of a tool call;
* local collaboration still works (A smoke: `LOCAL_EXPLORE`, 2 branches).

**It does not claim:**

* that AUTO understands semantically parallel tasks. RC-1R measured the Advisor selecting FOCUS
  in **6/6** judgeable AUTO trials; RC-1E adds no profiler and does not touch that path.
  `CF-UXA-04` stays **OPEN** with its trigger fired, and the release notes must not present AUTO
  as solving it (§27–§29/§45);
* that a remote principal will always compose. It did so 5/5 in this configuration, prompted by
  the product surface; a different model or a differently worded Ask may choose the
  `palimpsest_collaborate` route (equally valid, equally accepted) or answer directly (which E
  will fail, correctly, for a request that asks for independent approaches);
* anything about other provider/model configurations (§18);
* that the composed findings are verified — they remain exploratory cell-local hypotheses.

---

## 6. Merge discipline (§49, PASS path)

Reconciled RC branch → PR → PR CI attempt 1 → merge → canonical main exact SHA → canonical main
CI attempt 1 → tree identity evidence. Recorded in the carry-forward document's checkpoint
table once complete.
