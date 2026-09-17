# RC-1E — Carry-forward reassessment

Spec: RC-1E §44/§50. Reassessed **only** from measured evidence produced by this stage
(`release-evidence/rc1e-live-cross-project.json`) and by RC-1R. Nothing below is promoted
because RC-1E passed; nothing is closed without evidence.

---

## 1. Closed by this stage

| id | Item | Disposition |
| --- | --- | --- |
| **CF-E-01** (raised by RC-1R) — the answering project never reached for its own collaboration | **CLOSED_IN_RC1E.** The cause was product-surface discoverability, confirmed by the RC1E0 audit (no collaboration cue in the inbound attention text; `respond.compose` documented as a parenthesis; intent vocabulary invisible; and an oracle that measured a tool name). After the fix: **5/5** E trials used `RESPOND_COMPOSE` with `intent: PARALLEL`, 2 real isolated branches each, terminal `ANSWERED`, surfaced — with **0** authority/scope/disclosure violations. The regression guard is `test/rc1e_oracle_routes.test.ts` plus the frozen `E-old-direct` replay fixture, which still fails the old evidence. |
| **CF-E-02** (raised by this stage) — `responseStatus` / `originSurfaced` were not part of the oracle's judgement, only of the harness's ad-hoc record | **CLOSED_IN_RC1E.** Found while composing the release evidence (the fields read as `null`/`false` for trials that had genuinely surfaced). The oracle now reports `terminalStatus`, `surfaced` and `answerText`, and the composer reads them from the judgement — no consumer needs to recompute them from raw observations. |

---

## 2. Still OPEN, with the trigger state measured this stage

| id | Item | Trigger state after RC-1E | Disposition |
| --- | --- | --- | --- |
| **CF-UXA-04** | Semantic/model-backed task profiling for AUTO | **Trigger FIRED and reaffirmed.** RC-1R measured the Advisor choosing FOCUS in 6/6 judgeable AUTO trials on a prompt written as decomposable and separately verifiable. RC-1E deliberately did **not** add a profiler and did not touch the AUTO path (§27–§29): the E request already contained explicit collaboration vocabulary, so its failure was a handoff problem, not task ambiguity. The host still has the `TaskProfilerPort` seam. | **OPEN.** Per §28 this is a post-v1 adaptation improvement, not a release blocker: the core v1 promise ("the user explicitly asks for parallel / multiple independent approaches → real local multi-Agent collaboration") is qualified live (A 5/5 in RC-1R, A smoke here). The release notes must not claim AUTO semantic understanding. |
| UX-C 4.6 | Cold-resume runner proof | Not exercised: every live trial created its session and the shipped adapter resolved the resident session it created. | OPEN, trigger unchanged. |
| UX-C 4.4 | Host cost / budget presets | More real data: E trials 142–202 s (compose + 2 branches + answer + surfacing), D trials 71–162 s, A smoke 78 s. Token accounting is still not exposed by this host, so no cost claim is made. No pathological fan-out: D used **zero** branches in 5/5. | OPEN, trigger unchanged. |
| UX-C 4.5 | Branch session artifact retention | 10 more branch sessions created and read (every catalogue exactly one tool); nothing deleted. The DSH host persists them per branch; no retention policy is claimed. | OPEN, facts recorded. |
| UX-C 4.7 | Shared reasoning-service / Proof packaging | Still unreachable: no launch profile wires a Proof store, and RC-1E did not wire one to exercise the coupling. | OPEN, trigger unchanged. |
| CF-UXB-04 | Fuzzy project resolver | Exact resolution (`alias`/`displayName`) worked in 10/10 cross-project trials; the model derived the target from ordinary sentences every time. | OPEN, trigger unchanged. |
| Finding-specific verification | No trial produced evidence that a finding-level verification target is needed; the E composed findings remain exploratory and were not verified. | OPEN, no evidence. |
| Branch-artifact growth | RC-1E added 10 branch sessions to the host's session store in ~20 minutes of live work; the store is measured, not pruned. | OPEN as a disk-hygiene trigger if branch-heavy collaboration becomes routine. |

---

## 3. New observations worth recording (not items)

1. **The model chose the product's compose path rather than the two-tool path.** All five
   E trials used `respond(answer.compose, intent PARALLEL)`; none called
   `palimpsest_collaborate` first. Both routes are accepted by the qualification (§18), and
   this is the first live evidence about which one a principal prefers when both are
   discoverable: the one-operation form won 5/5. That is an observation about a lazily-evaluated
   preference, not a product requirement — the expert path stays documented and equal.
2. **A killed run is not a passing run.** The first E sample's trial 1 reached
   `respond(compose PARALLEL)` and spawned a real branch before the invoking shell killed the
   harness. It is retained as separate evidence and excluded from the sample; the five trials
   that count reached a terminal answer and origin surfacing.
3. **`%TEMP%` hygiene held.** The killed run left 13 state directories behind; the PR #116
   sweep reports and removes `palimpsest-*` directories on every suite run, and the RC-1E gate
   run removed 700 leaked directories. No RC-1E work reintroduced leakage.

---

## 4. What does **not** carry forward

- No new kernel semantic species, authority plane, Agent identity, scheduler, store or protocol
  type was introduced (`RemoteIntentStore`, `InboundTaskStore`, `CollaborationRoutingStore`,
  `PROJECT_PARALLEL_ASK`, `REMOTE_EXPLORE` and `COLLABORATION_REQUEST` all remain non-existent).
- Ask remains Ask: no commitment events, no Work assignment, no handoff, no automatic
  applicability (§34).
- The outbound Ask still carries only routing/protocol fields, the exact task and any explicit
  `contextText` — no automatic Workspace/Journal/Asset/Proof dump (§35).
- Expert tools, raw federation tools, ReasoningCell tools and the Work CLI remain registered;
  no tool was hidden to improve E (§36).

---

## 5. Checkpoint

| Fact | Value |
| --- | --- |
| Reconciled onto canonical main | `b7fcb399c5630f29b94732569e1f91470d07dfda` (PR #116 preserved; pre-rebase tree preserved byte-identically) |
| RC-1E stage commit | `0274a86e8baef0c7021155af20f73148f704dba3` |
| Evidence bundle | `release-evidence/rc1e-live-cross-project.json` |
| Deterministic tests | `test/rc1e_intent_handoff.test.ts`, `test/rc1e_oracle_routes.test.ts`, `test/rc1r_oracle_replay.test.ts` |
| Live sample | D 5/5, E 5/5 (all `RESPOND_COMPOSE`), A 1/1 smoke |

## 6. Merge checkpoint (§49) — complete

| Step | Value |
| --- | --- |
| PR | #117 |
| PR CI attempt 1 | success (`35263611232`) |
| Merge commit | `b22187cde444f4b23b30d85b5862a641ac90d5be` |
| Tree identity | `git diff 0274a86 b22187c` EMPTY |
| Canonical main CI attempt 1 | success (`35264265782`, `run_attempt: 1`) |

The RC-1E claim — including the `CF-UXA-04`-stays-open qualification — is now the first
release-track claim backed by PR and canonical-main CI.
