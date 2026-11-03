# C6-R — Final Report (Provider Amendment A2)

**Stage:** Agent-Native Behavioral Qualification & Comparative Value.
**Branch:** `palimpsest-c6r-behavioral-qualification`
**Incoming baseline:** `d1a05a7bfc145258efa34c2710998db04680d266` / tree
`e96cec6318bb35639e7083b222b811b8b2f59b11`
**Code Freeze 1 (original):** `103c4eb107418e0d253d27681ec33f77b0514de3` / tree
`b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f`
**Provider Amendment A2 / Code Freeze 2:** `508c9a07a4bbb9439947c8ae95eaa298ad7341ba` / tree
`1c842de2641dcd93a99f00b0ac2253f48f79dba2`
**Rig Correction C1 / Code Freeze 3:** `7b80a17ea4fd037b4ab1cbdc0b03828f6dad4ecf` / tree
`d1fadcfcdc92de8817e41ea6af82dd3160877d21`
**Provider:** `opencode` / `deepseek-v4.1-flash`
**Model result:** one real partial P1 (790,661 tokens, truncated by a 502); one blocked re-run
(0 tokens); no F1.

**Stage label:** `C6-R: THE EXPERIMENT IS QUALIFIED AND THE OPENCODE ROUTE IS REACHABLE; A REAL
PRINCIPAL PRODUCED A STRONG PARTIAL DISCOVERY, BUT THE GATEWAY TRUNCATED IT AND THE SINGLE RE-RUN WAS
BLOCKED BEFORE ANY TURN. NO COMPLETE AGENT PROPOSAL, AUTHORIZED EFFECT, FRESH SESSION OR MATCHED
COMPARISON EXISTS`.

**Gates:** R0 **ESTABLISHED**, R1 **ESTABLISHED**, R2 **ESTABLISHED (isolated runtime; Windows
excluded)**, R3 **ESTABLISHED**, R4 **BLOCKED (partial diagnostic only)**, R5 **BLOCKED**,
R6 **BLOCKED**, R7 **BLOCKED**, R8 **ESTABLISHED**.

---

## A. Git integrity

| question | answer |
| --- | --- |
| Exact incoming baseline | `d1a05a7…` / tree `e96cec6…`, verified before mutation |
| Branch | `palimpsest-c6r-behavioral-qualification`, created once from `d1a05a7` |
| Commit chain | C6-R0 `5f917d9` → R1/R2 `1868898` → R3/R4 `103c4eb` (CF1) → verification `2411eef` → Evidence Freeze `f6dfd89` → manifest `8d2ff6e` → provider A2 `508c9a0` (CF2) → A2 verification `6207e85` → rig C1 `7b80a17` (CF3) → C1 verification `82191d7` → amended evidence freeze (forward) |
| Production files changed in C6-R | **none**; COG-6's `src/composition/continuation.ts` fix is inherited |
| Executable change after CF3 | **none**; the amended reports, outcomes and manifest are evidence |
| Protected `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b`, unchanged |
| Protected resources | 95 worktrees, 2 locks, 19 gate roots, 75 evidence trees, 0 stashes |
| PR / merge / tag / branch deletion / force-push / worktree prune / lock removal | **none** |

## B. Evidence correction

Unchanged from the original C6-R report and still established:

- COG-6's `mechanism.rubric.acceptedCapabilitiesDigest` is Candidate B (`14ffdd65…`), produced by
  the out-of-repo extractor from the **post-control** snapshot, not by the rubric.
- The accepted blob is Candidate A (`0e997cbc…`) at the accepted intake head `55370b0f…`.
- The rubric ran ≈134 ms **before** the direct Candidate B control; its `siteBVendors: []` is only
  producible from A, because B makes V4 compliant.
- The forward erratum is `C6R-COG6-EVIDENCE-PROVENANCE-ERRATUM.md`; the historical COG-6 freeze is
  untouched.
- The C6-R collector requires a committed blob at an explicit head, an evaluation time and a result
  subject; an unresolvable basis is `UNQUALIFIED`.

## C. Scenario validity

- T1 (`2026-02-10T09:05:00Z`) exposes exactly three events; Candidate B, the duplicate and their
  metadata are absent. T2 releases them unaccepted. Fifteen regressions pin this.
- P1a's inbox read returned exactly three records; it did not see B.
- F1 is generated from the same facts; the equivalence audit is **8/8 identical, 0 confounders**
  (goal, requirements, historical deliverable digests, READY work, journal facts, inbox visible-set
  digest, source tree, observation time).
- Neither world contains the expected conclusion, the Site B invalidation, Candidate B before T2, or
  the evaluator rubric.

## D. DSH runtime safety

- DSH `0.2.1-rc.3`; the isolated WSL2/bubblewrap runtime; private PID and network namespaces; a
  provider-only Unix-socket proxy.
- Windows was excluded: its ACL backend confines **writes only**; reads, network and process
  visibility are not confined.
- The opencode key (51 characters) stayed outside the sandbox in `provider_config.json`; the sandbox
  received a placeholder. The proxy stripped client auth and injected `Authorization: Bearer`.
- Permission preset `workspace-write` activated; approval `never`; out-of-workspace writes denied;
  self-escalation refused; inherited env secrets absent; external DNS failed; only
  `POST /v1/chat/completions` was allowed (403 otherwise).
- **New scope finding:** P1a read `/run/p1/state` (SQLite), `/product/dist` (product code),
  `/dsh-home` and `/run/p1/home` (runtime/profile) even though the prompt said to work only inside the
  programme repository and inbox. The sandbox permits reads outside the workspace and restricts
  writes only. No write occurred and the evaluator oracle was not touched, but the **read boundary is
  wider than the prompt's stated workspace**. A future strict trial should hide the state DB and
  product source from the model's read view or enforce a read scope.
- The actual request headers recorded 17 base tools (probe) and 37 tools (P1: 17 base + 20
  `palimpsest_*`). Descriptions and `mode` markers were never treated as enforcement.

## E. Real Agent discovery

**Partial diagnostic observation; R4 remains BLOCKED.**

P1a (run `c6r-002`, Code Freeze 2, session `session-f6adbe2e-…`):

- 21 assistant messages, 43 tool calls, **790,661 tokens**, 666,069 ms;
- it found the 2026-02-10 bulletin, hashed it (`0e997cbc…`), diffed it against canonical data, and
  identified V3's `-10 → 0 °C` change;
- it concluded Site B has **no compliant vendor** (V3 fails the temperature; V1/V2/V4 lack the
  coastal warranty) and that Site C still fits;
- it kept the candidate **unaccepted** and identified the programme lead as the acceptance authority;
- it noted the cost/schedule envelope and the Site A schedule risk;
- it designed an exact `bulletin-intake` task (digest, target, write scope, no promotion);
- it did **not** create the task, change canonical data, promote, or relax a requirement;
- the turn ended in a provider `502` before a completed proposal or final answer.

P1b (run `c6r-003`, Code Freeze 3) failed before any assistant turn: six `502 ECONNRESET`, zero
tokens, zero tool calls, run `BLOCKED`.

This is strong evidence of discovery and negative-intelligence reasoning, but it is **not a complete
scored P1**, and H6-D/H6-P/H6-A are not established as a completed trial. The partial behavior is
preserved in `research-evidence/c6r/runs/c6r-002/P1/p1-behavior.json`.

## F. Proposals and authority

P1a's text contains an exact candidate identity and digest, the target
`sources/vendor-capabilities.csv`, the intended intake work, the candidate/canonical distinction,
the required independent approval, and the no-relaxation rule. It explicitly refused to accept
supplier data itself. It did **not** create the intake task or produce a structured proposal before
the 502, so no operator decision was applied to an Agent proposal.

No model attempted a requirement change, a source acceptance, or a promotion. The authority boundary
holds. **R5: BLOCKED.**

## G. Executed continuation

No T1 effects were executed. There was no Agent proposal, no operator approval, no intake Work, no
`ATTEMPT_RESULT`, no Promotion, no `TASK_SATISFIED`, and no head change in C6-R.

The COG-6 deterministic mechanism remains the last executed product path; it is inherited evidence,
not a C6-R Agent result. The goal remains distinct from the completed investigative Work: Site B has
no compliant vendor and the procurement objective is not achieved.

## H. Fresh-session continuity

No P3 or F2 session was created. The T2 release mechanism is implemented and tested, but no model
saw T2. **R6: BLOCKED.**

## I. Comparative value

The P/F worlds are mechanically matched (8/8, 0 confounders), but F1 never ran because P1 never
completed. There is no matched pair, no decision-quality comparison, no coordination-cost
measurement, and no superiority, efficiency or cost claim. **R7: BLOCKED.**

## J. Architecture recommendation

### Primary recommendation: **F — the evidence is still incomplete.**

The exact blocker is **provider/gateway reliability**, not a missing product capability:

- the opencode route is reachable and funded (probe `PROBE_OK`, 3,587 tokens);
- P1a made substantial correct progress, then the gateway reset the connection at the end of an
  11.1-minute turn (`502`);
- P1b failed six times before any assistant turn (`502`, 0 tokens);
- no F1 or matched comparison exists.

The partial P1a is evidence **against** two alternative bottlenecks: the model understood the project
and used the existing tools (not primarily a capability-presentation failure), and it reasoned about
the exact candidate, digest, target and approval (not primarily a proposal/authority handoff gap).
But a recommendation of A, B, C, D or E on a truncated turn would be an overclaim. The missing link is
a completed model turn under a stable provider.

**Smallest decisive next test:**

1. Use a stable provider window or repair the gateway route (or an owner-approved equivalent funded
   endpoint); do not change the model family silently.
2. Under Code Freeze 3 (the frozen classifier and 480-second bound), run **one** P1 discovery session
   with the same prompt, T1 world and authority policy. If it is blocked, truncated or invalid,
   preserve it and stop.
3. If P1 completes, run F1 with the same route and evaluate the matched pair. Then P3/F2 only if a
   T1 evolution occurs.
4. For a strict trial, narrow the model's read view to the programme repository and inbox (the P1a
   scope observation), or disclose that the state DB and product source are readable.

Do not add a router, ticket database, subscription engine, watchdog, second head authority,
scheduler or another agent runtime. The partial P1a used the existing product surfaces; the failure
is transport, not orchestration.

---

## Gate verdicts

| gate | verdict | basis |
| --- | --- | --- |
| **R0 — Evidence provenance** | **ESTABLISHED** | A/B, rubric timing and source identities distinguished; forward erratum; committed-blob collector |
| **R1 — Scenario validity** | **ESTABLISHED** | T1 hides B; T2 releases it unaccepted; P/F T1 matched; 15 visibility tests |
| **R2 — Runtime safety** | **ESTABLISHED (isolated runtime)** | preset activation, write denials, self-escalation refusal, provider-only egress, key outside the sandbox; Windows excluded; the wider read view is disclosed |
| **R3 — Experiment runner readiness** | **ESTABLISHED** | P/F equivalence 8/8, 0 confounders; real 20-tool P host; state machine; usage; process-group kill; 480 s bound |
| **R4 — Matched natural discovery** | **BLOCKED** | P1a truncated by 502 after strong partial discovery; P1b blocked before any turn; F1 not run |
| **R5 — Authorized project evolution** | **BLOCKED** | no completed Agent proposal, no operator decision, no effect |
| **R6 — Fresh-session continuity** | **BLOCKED** | no new Session |
| **R7 — Comparative value** | **BLOCKED** | matched worlds, no completed model pair |
| **R8 — Engineering and research integrity** | **ESTABLISHED** | exact baseline; three Code Freezes; build/architecture/public API/targeted 75 tests; budget evidence; protected resources; hashed evidence manifest |

## Preserved negative findings

1. **The original provider was blocked at TLS** (`api.deepseek.com` fake-IP `198.18.0.38`); run
   `c6r-001` remains `BLOCKED`.
2. **P1a was truncated** by a provider 502 after 21 assistant messages and 790,661 tokens; its run is
   `INVALID`, not a completed P1.
3. **P1b was blocked before any turn**: six 502 resets, 0 tokens; run `c6r-003` is `BLOCKED`.
4. **No F1, no matched pair, no comparison.**
5. **No Agent proposal task, operator approval, Work, Promotion or `TASK_SATISFIED` in C6-R.**
6. **P1a overran the 8-minute target** (666 s); Code Freeze 3 enforces 480 s, and P1b failed before
   reaching it.
7. **The model read outside the stated workspace** (state DB, product source, runtime home); no write
   occurred, but the read boundary is wider than the prompt.
8. **The provider gateway is unstable**: 3/4 probe attempts reset before success; P1a had many resets
   and a final 502; P1b failed 6/6.
9. **No credential entered the sandbox**; the key was read by the proxy outside and never logged.
10. **The mock qualifications are not cognition**; their tokens are synthetic.
11. **Node `v24.14.1` is below the declared `>=24.15.0`**; the warning is preserved.

## Budget

| item | sessions | tokens |
| --- | --- | --- |
| probe | 1 | 3,587 |
| P1a (invalid) | 2 | 790,661 |
| P1b (blocked) | 3 | 0 |
| total | **3** | **794,248** |

The hard caps are 6 sessions, 8,000,000 tokens, and no new session at 5,000,000. The campaign stopped
because the gateway failed, not because a cap was reached. No further model call was made after
P1b.
