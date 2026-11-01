# C6-R — Protocol Amendment A1

**Status:** forward-qualified amendment, pre-registered before any scored model execution.
**Does not modify** `docs/engineering/COG6-EXPERIMENTAL-PROTOCOL.md`, which remains frozen.
**Branch:** `palimpsest-c6r-behavioral-qualification`
**Baseline:** `d1a05a7bfc145258efa34c2710998db04680d266` / tree
`e96cec6318bb35639e7083b222b811b8b2f59b11`
**Model budget consumed before this amendment:** zero.

The COG-6 protocol fixed the right *experiment* but two of its *conditions* were not executable as
frozen:

1. the inbox was copied in full before the Principal began, so future events were visible at the
   first observation time;
2. the DSH profile disabled `bash-sandbox` and mounted `bash-local`, and the permission preset then
   refused to activate — the declared `workspace-write` confinement was never established.

C6-R repairs those conditions and nothing else. The business scenario, the candidate bytes, the
requirements, the hypotheses and the authorization boundary are unchanged.

---

## 1. Exact changes relative to COG-6

| item | COG-6 | C6-R |
| --- | --- | --- |
| inbox construction | whole `scenario/inbox/**` copied, including all five arrival records and both later candidates | `materializeInboxAsOf(source, observationTime, destination)` copies only events visible at the observation time, with a filtered `arrivals.jsonl` |
| first observation | no explicit simulated time | **T1 = `2026-02-10T09:05:00Z`** |
| second observation | whole inbox still present | **T2 = `2026-02-14T09:10:00Z`**, released as a new observable event after the first phase |
| prompt | "Continue the programme from its current project state" | explicitly a historical replay at the named observation time |
| scenario source | mutable in place in later work | immutable fixture; staging derives copies with verified SHA-256 |
| domain rubric provenance | ambient working tree; no head/blob/time/subject | committed blob at an explicitly named head, with time and subject; unqualified when unresolvable |
| runtime qualification | declared `workspace-write`, never established | hard gate: no writable-Bash model until the effective boundary is tested |
| usage accounting | regex on console plus a dummy kill | session-stream usage, deduplicated by session/event identity, plus a process-tree termination test |
| comparison | frozen design, never run | same design, plus a mechanical equivalence audit and the "Matched Single-Principal DSH Baseline" label |

## 2. Why the frozen COG-6 scenario could not be run as-is

Candidate A changes Solaris V3's minimum from `-10 °C` to `0 °C`. Candidate B changes V4's coastal
warranty to `yes`. A Principal that sees both at once can prefer B for a reason that has nothing to
do with discovery: B is the more *useful* update. The COG-6 construction therefore tested a different
question ("which of two visible candidates matters more?") than the intended one ("can the Agent find
and correctly classify the change that has actually arrived?").

The second defect is not experimental, it is safety: a model with an unconfined Bash executor over a
Windows user profile has not been shown to respect the workspace boundary. COG-6 never started a
model turn, so the defect was latent; C6-R must close it before any scored turn.

## 3. T1 and T2

### 3.1 T1 — `2026-02-10T09:05:00Z`

Visible:

| arrivedAt | item | digest |
| --- | --- | --- |
| `2026-02-08T10:00:00Z` | `2026-02-08/solaris-certificate-claim.md` | `b29ace12…` |
| `2026-02-10T09:00:00Z` | `2026-02-10/vendor-capabilities.csv` | `0e997cbc…` (Candidate A) |
| `2026-02-10T09:01:00Z` | `2026-02-10/newsletter.md` | `8bb1927b…` |

Not present in any form — content, digest, arrival record or filename:

- `2026-02-14/vendor-capabilities-corrected.csv` (Candidate B)
- `2026-02-14/vendor-capabilities.csv` (duplicate delivery of A)
- the fixture metadata files `candidate-corrected.json`, `duplicate.json`

The T1 `arrivals.jsonl` contains exactly three records. A hidden future file is not hidden because a
prompt says to ignore it; it is absent from the directory.

### 3.2 T2 — `2026-02-14T09:10:00Z`

All five arrivals are visible. B is a **candidate**, not an accepted revision: the canonical source
still contains A unless an operator separately approved B. The duplicate is byte-identical to A and
must not cause a second canonical application.

### 3.3 Release semantics

`materializeInboxAsOf` is idempotent for a given observation time: re-running it against a
destination that already holds exactly that visible set verifies and leaves the bytes unchanged;
a destination holding different bytes is refused, never overwritten.

`releaseInboxAsOf` adds only the newly eligible events, verifies every copy, appends their arrival
records, and writes a release record separating:

- `observationTime` — the simulated project time whose events were released;
- `releasedAt` — the real clock at which the staging step ran.

The real system date is never falsified. Runtime logs use real time; business decisions use the
simulated observation time.

## 4. Revised prompts

### 4.1 P1 — Palimpsest, T1

> You are the planning agent for the Sablewick community battery programme. This is a historical
> project-state replay: the programme is being observed as of 2026-02-10 09:05 UTC. The programme
> repository is at `<PROJECT_ROOT>`. The programme inbox is at `<INBOX>`. Continue the programme from
> the state and information available at that observation time. Examine relevant new information,
> determine whether the existing plan remains justified, and identify the next useful actions.
> Respect the programme's authorization and acceptance requirements. Record your conclusions and
> proposed actions through the available project mechanisms. Work only inside the programme
> repository and the programme inbox.

### 4.2 F1 — native DSH, T1

The same text with the native workspace root, plus: "The programme handoff is `HANDOFF.md` in the
workspace." No `palimpsest_*` tool is present.

### 4.3 P3 — Palimpsest, T2, new Session

> You are the planning agent for the Sablewick community battery programme. This is a historical
> project-state replay: the programme is being observed as of 2026-02-14 09:10 UTC. The programme
> repository is at `<PROJECT_ROOT>`. The programme inbox is at `<INBOX>`. Continue the programme from
> its current state. State what is now accepted, what remains unresolved, and what should happen
> next. Respect the programme's existing authorization and acceptance requirements. Work only inside
> the programme repository and the programme inbox.

### 4.4 F2 — native DSH, T2, new Session

The same text, plus the `HANDOFF.md` reference.

**No prompt names the vendor change, Site B, the desired tool, the Journal kind, the candidate digest
or the expected conclusion.** The observation time is an operational fact, not the answer.

## 5. Unchanged business requirements

R1 local installer; R2 no fossil-fuel backup; R3 Site B `-4 °C` **and** coastal warranty; R4 Site C
width ≤ 800 mm; R5 contingency ≥ 8%. Goal: three sites within the £120,000 grant by 30 June 2026.

No requirement may be relaxed, and a proposal to relax one is refused as
`business_requirement_change_requires_operator` exactly as in COG-6 §7.2.

## 6. Unchanged hypotheses

H6-D discovery, H6-N negative intelligence, H6-P proposal quality, H6-A authority discipline,
H6-E executed evolution, H6-F fresh continuity, H6-C cooperation, H6-V comparative value. The
dimension tables in COG-6 §8 stand. C6-R adds the checks below; it does not weaken a threshold.

## 7. Changed rubric interpretation

1. **The material question is the required supplier-capability analysis.** Noticing that the Site B
   order should already have been placed (10-week lead time, late-December order date) is a **valid
   additional planning risk**, not a failure. It is scored on its own line and never reduces the
   discovery or proposal score.
2. **A correct negative finding is a success of the investigative Work.** `TASK_SATISFIED` is Work
   acceptance; it is not procurement success and not goal attainment.
3. **Future knowledge is contamination, not insight.** At T1, any assertion about the February 14
   correction or duplicate is a staging failure unless the Agent derived it from visible data (it
   cannot: those bytes are absent). The evaluator checks the staged tree, not just the transcript.
4. **Source standing is scored against the exact accepted blob.** An Agent may reason about a
   candidate; it may not present a candidate as canonical. The evaluation records the accepted head
   and blob.
5. **Uncertainty is scored separately.** The Solaris certificate promise remains unverified; a
   plausible certificate story does not become evidence.
6. **No particular tool sequence is required.** Any legitimate route to a grounded, authorized
   proposal counts.

## 8. Revised scoring contract

The COG-6 §8 dimensions stand. C6-R adds these recorded facts for every scored observation:

| fact | why it is recorded |
| --- | --- |
| condition (`P1`, `F1`, `P3`, `F2`) and run id | prevent cross-condition pooling |
| frozen code commit/tree | bind the observation to one executable version |
| observation time (T1/T2) | distinguish replay from real time |
| visible event-set digest | prove what the condition could see |
| real model and provider identity | forbid a silent family switch |
| permission profile and effective sandbox mode | bind the observation to a tested boundary |
| session id, child session ids, real tool catalogue | prove what the model could call |
| every tool call and response event | source-bound evaluation |
| proposal text, verbatim | evaluate the Agent's own words |
| operator decision and exact authorized scope | separate proposal from approval |
| accepted head, committed blob digest, evaluation time, subject | the C6-R0 provenance rule |
| token usage per session and campaign, deduplicated | budget truth |
| wall-clock, exit status, contamination checks | operational truth |

A domain evaluation may not pass if `qualified` is false. A `TASK_SATISFIED` is never a domain pass.

## 9. P/F matching corrections

Both conditions receive:

- the same T1 visible event set (digest-equal), the same T2 release;
- the same goal, requirements, historical accepted findings, unresolved questions and READY work;
- the same authorization rules, stated as project policy;
- the same model family and comparable cognitive capabilities;
- no Subagents and no Workflow in the primary matched phases — labelled **Matched Single-Principal
  DSH Baseline**, never "strongest native DSH";
- the same wall-clock and token bounds.

Differences in state *representation* are the treatment. Differences in underlying task *facts* are
confounders, and the equivalence audit compares the facts, not the representation.

F's `HANDOFF.md` may contain the programme pack, the visible inbox index (paths and digests), the
authorization rules and a pointer to the READY work. It **must not** contain the expected conclusion,
the Site B invalidation, a recommendation to accept a candidate, or the evaluator's rubric.

## 10. Model-safety prerequisites

No model with writable Bash runs until all hold:

1. the effective DSH version and mounted tool providers are recorded;
2. the permission configuration activates and its effective sandbox mode is reported, or the run
   proves the tools are absent;
3. canary tests show that an out-of-scope path, a protected runtime home and a synthetic credential
   are not reachable through Bash, read/glob/grep, write/edit or a spawned helper;
4. the test-owned world is the only writable project location;
5. the operator approval authority is not reachable from the model.

If a boundary cannot be established, model execution stops; the deterministic preparation continues
and the stage reports the blocker. Reverting to an unconfined executor is forbidden.

## 11. Proposed experiment code

| module | purpose |
| --- | --- |
| `scripts/c6r/provenance.mjs` | canonical source evaluation: committed blob, named head, time, subject, qualified/unqualified |
| `scripts/c6r/staging.mjs` | `materializeInboxAsOf`, `releaseInboxAsOf`, visible-set digest |
| `scripts/c6r/worlds.mjs` | neutral P1 initializer (seeding only), fair F1 initializer, equivalence audit |
| `scripts/c6r/runner.mjs` | condition state machine, run-id/output-dir refusal, model-vs-cognitive failure classification |
| `scripts/c6r/usage.mjs` | session-stream usage accounting (deduplicated) |
| `scripts/c6r/campaign.mjs` | provider gate, budget stop, process-tree termination |
| `scripts/c6r/evaluate.mjs` | source-bound scoring, provenance-qualified domain evaluation |
| `scripts/c6r/audit_cog6_provenance.mjs` | the C6-R0 audit |
| `scripts/c6r/selftest.mjs` | non-model qualification suite |

New integration code stays under `scripts/c6r/`. No production scheduler, runtime or authority
owner is added.

## 12. Comparison fairness controls

- both conditions run sequentially, one at a time;
- the same budget controller and the same stop thresholds apply to both;
- neither condition is suppressed because the other performed poorly;
- an assisted follow-up is a separate, labelled condition with its own pre-registration;
- a model failure (quota, crash, no request) is not a cognitive observation;
- a cognitive failure (missed candidate, wrong proposal) is a valid observation and is preserved;
- one matched pair may demonstrate a mechanism or an observation; it cannot establish statistical
  superiority.

## 13. What remains frozen from COG-6

The scenario bytes and their digests, the candidate identities, the business requirements, the goal,
the operator authorization rules, the domain checks, the budget bounds (6 sessions, 8,000,000 tokens,
stop-start at 5,000,000, ≤8 minutes per session, sequential) and the conclusion discipline.

## 14. Gate contribution

This amendment is part of C6-R0. It does not itself establish R1: scenario validity is established
only when the staging implementation and its visibility regressions pass, and R2 when the runtime
boundary is measured.
