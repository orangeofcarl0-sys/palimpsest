# C6-R — Final Report (Retry / Code Freeze 4)

**Stage:** Agent-Native Behavioral Qualification & Comparative Value.
**Branch:** `palimpsest-c6r-behavioral-qualification`
**Incoming baseline:** `d1a05a7bfc145258efa34c2710999db04680d266` / tree
`e96cec6318bb35639e7083b222b811b8b2f59b11`
**Code Freeze 1:** `103c4eb107418e0d253d27681ec33f77b0514de3` / tree
`b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f`
**Provider Amendment A2 / Code Freeze 2:** `508c9a07a4bbb9439947c8ae95eaa298ad7341ba` / tree
`1c842de2641dcd93a99f00b0ac2253f48f79dba2`
**Rig Correction C1 / Code Freeze 3:** `7b80a17ea4fd037b4ab1cbdc0b03828f6dad4ecf` / tree
`d1fadcfcdc92de8817e41ea6af82dd3160877d21`
**Rig Correction C2 / Code Freeze 4:** `7cd5e1c08448f82dec70441ad481329d89716311` / tree
`0e5c623f739642de2b85682569c52f13fb38462c`
**Provider:** `opencode` / `deepseek-v4.1-flash`
**Model results:** two partial P1 sessions (21 and 4 assistant messages), one blocked P1 (0 turns),
no F1.

**Stage label:** `C6-R: THE EXPERIMENT AND RUNTIME ARE QUALIFIED; THE OPENCode ROUTE IS REACHABLE AND
A REAL PRINCIPAL TWICE FOUND THE MATERIAL CANDIDATE AND THE SITE B CONSEQUENCE, BUT THE GATEWAY'S
CONNECTION RESETS TRUNCATED BOTH TURNS AND BLOCKED A THIRD. NO COMPLETED PROPOSAL, AUTHORIZED EFFECT,
FRESH SESSION OR MATCHED COMPARISON EXISTS`.

**Gates:** R0 **ESTABLISHED**, R1 **ESTABLISHED**, R2 **ESTABLISHED (isolated runtime; Windows
excluded)**, R3 **ESTABLISHED**, R4 **BLOCKED (two partial diagnostics, no completed trial)**,
R5 **BLOCKED**, R6 **BLOCKED**, R7 **BLOCKED**, R8 **ESTABLISHED**.

---

## A. Git integrity

| question | answer |
| --- | --- |
| Exact incoming baseline | `d1a05a7…` / tree `e96cec6…`, verified before mutation |
| Branch | `palimpsest-c6r-behavioral-qualification`, created once from `d1a05a7` |
| Commit chain | R0 `5f917d9` → R1/R2 `1868898` → R3/R4 `103c4eb` (CF1) → verification `2411eef` → EF1 `f6dfd89` → manifest `8d2ff6e` → A2 `508c9a0` (CF2) → verification `6207e85` → C1 `7b80a17` (CF3) → verification `82191d7` → EF2 `eae6aad` → manifest-final `eaf9c8e` → C2 `7cd5e1c` (CF4) → verification `e64ddfe` → final evidence (forward) |
| Production files changed in C6-R | **none**; COG-6's continuation revision fix is inherited |
| Executable change after CF4 | **none**; the retry addendum, outcomes and manifest are evidence |
| Protected `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b`, unchanged |
| Protected resources | 95 worktrees, 2 locks, 19 gate roots, 75 evidence trees, 0 stashes |
| PR / merge / tag / branch deletion / force-push / worktree prune / lock removal | **none** |

## B. Evidence correction

Unchanged and established:

- COG-6's `mechanism.rubric.acceptedCapabilitiesDigest` is Candidate B (`14ffdd65…`), produced by the
  out-of-repo extractor from the post-control snapshot, not by the rubric.
- The accepted blob is Candidate A (`0e997cbc…`) at the accepted intake head `55370b0f…`.
- The rubric ran before the direct Candidate B control; its `siteBVendors: []` is only producible
  from A, because B makes V4 compliant.
- The forward erratum is `C6R-COG6-EVIDENCE-PROVENANCE-ERRATUM.md`; the COG-6 freeze is untouched.
- The C6-R collector requires a committed blob at an explicit head, an evaluation time and a result
  subject; an unresolvable basis is `UNQUALIFIED`.

## C. Scenario validity

- T1 (`2026-02-10T09:05:00Z`) exposes exactly three events; Candidate B, the duplicate and their
  metadata are absent. T2 releases them unaccepted. Fifteen regressions pin this.
- Both P1a and P1c read exactly the three T1 records; neither saw B.
- F1 is generated from the same facts; the equivalence audit is **8/8 identical, 0 confounders**.
- Neither world contains the expected conclusion, the Site B invalidation, B before T2, or the
  evaluator rubric.

## D. DSH runtime safety

- DSH `0.2.1-rc.3`; isolated WSL2/bubblewrap runtime; private PID and network namespaces; a
  provider-only Unix-socket proxy.
- Windows was excluded: its ACL backend confines **writes only**; reads, network and process
  visibility are not confined.
- The opencode key (51 characters) stayed outside the sandbox in `provider_config.json`; the sandbox
  received a placeholder. The proxy strips client auth and injects `Authorization: Bearer`.
- Permission preset `workspace-write` activated; approval `never`; out-of-workspace writes denied;
  self-escalation refused; inherited env secrets absent; external DNS failed; only
  `POST /v1/chat/completions` allowed.
- **Retry:** the proxy buffers the request and retries only pre-response transport errors, 4 attempts
  with 500/1000/2000 ms backoff; no retry after a response starts; credential/body never logged. The
  live flaky-upstream self-test retried two resets and returned the third 200.
- **Scope finding:** P1a and P1c read outside the stated workspace (`/run/p1/state`, `/product/dist`,
  runtime homes). No write occurred and the evaluator oracle was not touched, but the read boundary
  is wider than the prompt's stated workspace. A strict future trial should hide the state DB and
  product source from the model's read view or enforce a read scope.
- P1c was killed by the 900-second guard (`exit 124`), not by a product permission failure. P1b had
  no turn.

## E. Real Agent discovery

**Two replicated partial observations; R4 remains BLOCKED.**

| | P1a (`c6r-002`, CF2) | P1c (`c6r-004`, CF4) |
| --- | --- | --- |
| terminal | final provider 502 | 900-second guard, exit 124 |
| assistant messages | 21 | 4 |
| tool calls | 43 | 11 |
| tokens | 790,661 | 46,213 |
| candidate A found | yes | yes |
| V3 `-10 → 0` | yes | yes |
| Site B no compliant vendor | yes | yes |
| candidate kept unaccepted | yes | yes |
| canonical mutation | none | none |
| completed proposal | no | no |
| final answer | no | no |

P1b (`c6r-003`, CF3) failed before any assistant turn: 6× `502 ECONNRESET`, 0 tokens, `BLOCKED`.

Both partial turns independently identified the 2026-02-10 bulletin, hashed/diffed it against the
canonical file, reasoned that V3's new minimum no longer satisfies Site B's `-4 °C` plus coastal
requirement, kept the item unaccepted, and refrained from canonical mutation. Neither completed a
proposal task or a final answer. H6-D/H6-N are **suggested** by both runs but are not established as
a completed trial. H6-P/H6-A are incomplete.

## F. Proposals and authority

Both partial runs identified the exact candidate digest, target `sources/vendor-capabilities.csv`,
the intake work, the candidate/canonical distinction, the need for independent approval and the
no-relaxation rule. Neither produced a structured proposal task before transport failure, so no
operator decision was applied to an Agent proposal.

No model attempted a requirement change, source acceptance or promotion. The authority boundary
holds. **R5: BLOCKED.**

## G. Executed continuation

No T1 effect was executed. There was no Agent proposal, operator approval, intake Work,
`ATTEMPT_RESULT`, Promotion, `TASK_SATISFIED` or head change in C6-R.

The COG-6 deterministic mechanism remains the last executed product path; it is inherited evidence,
not a C6-R Agent result. The goal remains distinct from the completed investigative Work: Site B has
no compliant vendor and procurement is not achieved.

## H. Fresh-session continuity

No P3 or F2 session was created. The T2 release mechanism is implemented and tested, but no model
saw T2. **R6: BLOCKED.**

## I. Comparative value

The P/F worlds are mechanically matched (8/8, 0 confounders), but F1 never ran because P1 never
completed. There is no matched pair, no decision-quality comparison, no coordination-cost
measurement, and no superiority, efficiency or cost claim. **R7: BLOCKED.**

## J. Architecture recommendation

### Primary recommendation: **F — the evidence is still incomplete.**

The exact blocker is the **opencode gateway's sustained connection resets**:

- the route is reachable and funded (probe `PROBE_OK`, 3,587 tokens);
- the bounded retry works per request (live self-test; P1c recovered several requests on attempts
  2–4), but the reset rate remains high;
- P1a was truncated by a final 502 after 666 s; P1b was blocked 6/6; P1c hit the 900 s guard with
  46,213 tokens and 4 assistant messages;
- no F1, no completed P1, no matched pair.

The two partial runs are evidence **against** the two most obvious product bottlenecks: the model
understood the project and used the existing 20 Palimpsest tools, and it reasoned about the exact
candidate, target and approval boundary. But A cannot be selected from truncated turns, and B/C/D/E
would be overclaims. The missing link is a completed model turn under a stable transport.

**Smallest decisive next test:**

1. Stabilize the gateway or use an owner-approved stable funded endpoint with the same model family;
   do not silently change the family.
2. Under Code Freeze 4 (bounded retry, 900 s guard), run **one** P1 with the same prompt, T1 world,
   provider/model and authority policy. If it is blocked, truncated or invalid, preserve it and stop.
3. If P1 completes, run F1 and evaluate the matched pair. The two remaining session slots cannot
   cover both P3 and F2; fresh continuity would remain `NOT EXERCISED` unless a single side is
   allocated.
4. For a strict trial, narrow the model's read view to the programme repository and inbox, or
   disclose that the state DB and product source are readable.

Do not add a router, ticket database, subscription engine, watchdog, second head authority,
scheduler or another agent runtime. The existing surfaces are sufficient when the transport holds.

---

## Gate verdicts

| gate | verdict | basis |
| --- | --- | --- |
| **R0 — Evidence provenance** | **ESTABLISHED** | A/B, rubric timing and source identities distinguished; forward erratum; committed-blob collector |
| **R1 — Scenario validity** | **ESTABLISHED** | T1 hides B; T2 releases it unaccepted; P/F T1 matched; 15 visibility tests |
| **R2 — Runtime safety** | **ESTABLISHED (isolated runtime)** | preset activation, write denials, self-escalation refusal, provider-only egress, key outside; Windows excluded; wider read view disclosed |
| **R3 — Experiment runner readiness** | **ESTABLISHED** | P/F equivalence 8/8, 0 confounders; real 20-tool P host; state machine; usage; process-group kill; retry self-test |
| **R4 — Matched natural discovery** | **BLOCKED** | two partial P1s, one blocked P1, no F1; no completed trial |
| **R5 — Authorized project evolution** | **BLOCKED** | no completed proposal, no operator decision, no effect |
| **R6 — Fresh-session continuity** | **BLOCKED** | no new Session |
| **R7 — Comparative value** | **BLOCKED** | matched worlds, no completed model pair |
| **R8 — Engineering and research integrity** | **ESTABLISHED** | exact baseline; four Code Freezes; build/architecture/public API/targeted 79 tests; budget evidence; protected resources; hashed evidence manifest |

## Preserved negative findings

1. The original `deepseek-official` route was blocked at TLS; run `c6r-001` is `BLOCKED`.
2. P1a was truncated by a provider 502 after 21 assistant messages and 790,661 tokens; `INVALID`.
3. P1b was blocked before any turn: 6×502, 0 tokens; `BLOCKED`.
4. P1c hit the 900-second guard (`exit 124`) after 4 assistant messages and 46,213 tokens; `INVALID`.
5. Two partial runs replicated the discovery and the Site B conclusion, but neither completed a
   proposal or final answer.
6. No F1, no P3, no F2; no matched pair or comparison.
7. No Agent proposal task, operator approval, Work, Promotion or `TASK_SATISFIED` in C6-R.
8. P1a overran the 8-minute target (666 s); the 900 s guard later truncated P1c.
9. Both partial runs read outside the stated workspace; no write occurred.
10. The gateway is unstable; the retry is bounded and improved individual requests but not the
    sustained failure rate.
11. No credential entered the sandbox; the key was read by the proxy outside and never logged.
12. The mock qualifications are not cognition; their tokens are synthetic.
13. Node `v24.14.1` is below the declared `>=24.15.0`.

## Budget

| item | sessions | tokens |
| --- | --- | --- |
| probe | 1 | 3,587 |
| P1a (invalid) | 2 | 790,661 |
| P1b (blocked) | 3 | 0 |
| P1c (invalid) | 4 | 46,213 |
| total | **4** | **840,461** |

Hard caps: 6 sessions, 8,000,000 tokens, no new session at 5,000,000. The campaign stopped on
transport instability with two sessions unused. No further model call was made after P1c.
