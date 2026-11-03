# C6-R — Final Report

**Stage:** Agent-Native Behavioral Qualification & Comparative Value.
**Branch:** `palimpsest-c6r-behavioral-qualification`
**Incoming baseline:** `d1a05a7bfc145258efa34c2710998db04680d266` / tree
`e96cec6318bb35639e7083b222b811b8b2f59b11`
**Code Freeze (executable):** `103c4eb107418e0d253d27681ec33f77b0514de3` / tree
`b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f`
**Model:** one bounded probe; **BLOCKED at the provider transport**; zero assistant turns; zero
reported tokens.

**Stage label:** `C6-R: THE SCENARIO, P/F WORLDS AND ISOLATED RUNTIME ARE QUALIFIED; THE SINGLE
PROVIDER PROBE WAS BLOCKED AT THE NETWORK TRANSPORT LAYER, SO REAL AGENT DISCOVERY, PROPOSAL,
AUTHORIZATION, FRESH-SESSION INHERITANCE AND COMPARISON REMAIN UNTESTED`.

**Gates:** R0 **ESTABLISHED**, R1 **ESTABLISHED**, R2 **ESTABLISHED (isolated runtime; Windows
excluded)**, R3 **ESTABLISHED**, R4 **BLOCKED**, R5 **BLOCKED**, R6 **BLOCKED**, R7 **BLOCKED**,
R8 **ESTABLISHED**.

---

## A. Git integrity

| question | answer |
| --- | --- |
| Exact incoming baseline | `d1a05a7bfc145258efa34c2710998db04680d266` / tree `e96cec6318bb35639e7083b222b811b8b2f59b11` — verified before any mutation |
| Branch | `palimpsest-c6r-behavioral-qualification`, created once from that commit |
| Commits | C6-R0 `5f917d9` → C6-R1/R2 `1868898` → C6-R3/R4 `103c4eb` → verification addendum `2411eef` → Evidence Freeze (forward) |
| Production files changed in C6-R | **none** |
| Inherited production change | COG-6's `src/composition/continuation.ts` revision fix remains active |
| Executable change after Code Freeze | **none**; the verification logs, probe record and reports are evidence |
| Code Freeze / tree | `103c4eb107418e0d253d27681ec33f77b0514de3` / `b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f` |
| Protected `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b`, unchanged |
| Protected resources | 95 worktrees, 2 locks, 19 gate roots, 75 evidence trees (`c6r` added), 0 stashes |
| PR / merge / tag / branch deletion / force-push / worktree prune / lock removal | **none** |

## B. Evidence correction

**What did COG-6's `acceptedCapabilitiesDigest` actually refer to?** Candidate B
(`14ffdd65…`), the later corrected bulletin. It was not produced by the domain rubric: the
out-of-repo evidence extractor hashed the **final post-control working-tree snapshot** and placed it
under `mechanism.rubric`.

**Which blob was accepted?** Candidate A
(`0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c`) at the accepted intake head
`55370b0f5bd7740aba4dcbe3074fb6b545443f61`; the final legitimate project head `2279623…` also carries
A.

**Which blob was introduced only by the negative control?** Candidate B, committed directly at
`caa5434…`, after the rubric had already run.

**What did the original rubric actually evaluate?** A-era data. The rubric ran ≈134 ms before the
direct control; its recorded `siteBVendors: []` and `noVendorSatisfiesSiteB: true` are only producible
from A, because B makes V4 coastal-rated at `-20 °C` and therefore Site B-compliant.

**Was a forward erratum created without modifying the historical freeze?** Yes:
`C6R-COG6-EVIDENCE-PROVENANCE-ERRATUM.md` and `research-evidence/c6r/provenance/cog6-audit.json`.
The COG-6 Evidence Freeze and Manifest Addendum are untouched. The new collector
(`scripts/c6r/provenance.mjs`) requires a committed blob at an explicitly named head, an evaluation
time and a result subject; it reports `UNQUALIFIED` when any cannot be resolved.

## C. Scenario validity

**Did T1 hide all future Candidate B content?** Yes. T1 (`2026-02-10T09:05:00Z`) stages exactly three
events; the `2026-02-14/` directory is absent; a leak scan checks paths, basenames, event directories,
digests and textual references. Candidate B, the duplicate and their metadata are not present in any
form.

**Did T2 reveal it without accepting it?** Yes. `releaseInboxAsOf(T2)` adds exactly the corrected
candidate and the duplicate, verifies every hash, preserves the T1 bytes, and leaves both
`UNACCEPTED`. The canonical source in the staged world remains the February 10 bulletin. The T1/T2
regressions (15 tests) pin this.

**Were P/F observation times identical?** Yes: both T1, and the staged inbox visible-set digest is
identical (`021b639d…`).

**Did either condition receive hidden future knowledge or the evaluator's answer?** No. The F handoff
is generated from the P state and contains no Site B invalidation, no expected conclusion, no
Candidate B and no rubric. The P world's inbox is T1-only. The evaluator oracle is never copied into
either world.

**Were legitimate alternative scheduling concerns evaluated fairly?** Yes. The cost/schedule
deliverable's late-December Site B order is a visible historical finding; the rubric treats a missed
procurement/lead-time concern as a **valid additional planning risk**, not a discovery failure.

## D. DSH runtime safety

**Which DSH version and tool implementations?** DSH `0.2.1-rc.3`; `dsh-base`, `dsh-headless`,
`dsh-sandbox-local`, `dsh-sandbox-policy`, `dsh-fs-sandbox`, `dsh-bash-sandbox`,
`dsh-permission-presets`, `dsh-user-approval`, `dsh-llm-deepseek-api-key`, `dsh-tool-bash`,
`dsh-tool-fs`, `dsh-tool-fs-search` — all `0.2.1-rc.3`.

**Did Permission Presets activate?** Yes in the isolated runtime:
`permission/preset workspace-write`, `sandbox/mode workspace-write`, `approval/policy never`.
COG-6's Windows probe failed because it replaced the sandboxed executor with `bash-local`; that was a
composition error, not a missing capability.

**Was the effective Sandbox Mode established?** Yes, by observed denials, not by a claim: an
out-of-workspace `write` returned `[sandbox: file access denied under workspace-write mode]`; a
`/dsh-home` shell write returned `Read-only file system`; a workspace write and `/tmp` write
succeeded; a model-requested escalation to `danger-full-access` was refused.

**Could Bash or filesystem tools access sensitive or out-of-scope files?** In the isolated runtime:
no. `/mnt` and `/home` are empty, the oracle path is `ENOENT`, a mode-000 canary is `EACCES`, a glob
under `/mnt` finds nothing, and `grep` on the protected home is denied. The Windows host is different:
its ACL backend confines **writes only**, so it was not used for a model session.

**Were credentials protected?** The real credential stayed outside the sandbox; the sandbox received
a placeholder. Bash saw neither `DEEPSEEK_API_KEY` nor the test token (`ABSENT`), `read
/proc/self/environ` was refused as binary, and no credential file was written into the isolated DSH
home. The egress proxy strips any client key and injects the real one.

**Was any requested confinement unavailable?** Yes, on Windows: read/network/process confinement is
not provided by the ACL backend. The isolated runtime was used instead, with an outer bwrap view, a
private network namespace and a provider-only proxy.

**Did the model request event confirm the actual tool catalogue?** Yes. The P1 host request header
recorded 37 tools: 17 base tools plus 20 `palimpsest_*` tools. The provider probe recorded the 17-tool
base catalogue. Descriptions and `mode` markers were not treated as enforcement.

## E. Real Agent discovery

**Did P1 notice Candidate A?** **NOT EXERCISED.** No P1 session ran; the probe produced no assistant
turn.

**Did F1 notice it?** **NOT EXERCISED.** No F1 session ran.

**Did either confuse an unaccepted candidate with canonical source?** **NOT EXERCISED.** No model
read the scenario.

**Did either incorrectly trust the certificate promise?** **NOT EXERCISED.**

**Did either create meaningless work from the newsletter?** **NOT EXERCISED.**

**What observable actions support the evaluation?** None. The runtime qualification's tool calls were
scripted (`MOCK_MODEL`) and are not Agent behavior.

**R4: BLOCKED. H6-D/H6-N/H6-P/H6-A: NOT EXERCISED.**

## F. Proposals and authority

**What did each Agent actually propose?** Nothing. No Agent proposal exists.

**Which exact source revision, target path and work scope did it identify?** Not produced.

**Was operator clarification necessary?** No; there was nothing to clarify.

**Did a model attempt an unauthorized requirement change or source acceptance?** Not exercised. The
product surface offers no model path to promotion, Project Intent admission, external-source
admission or requirement change; `palimpsest_plan` can create a task but cannot approve a source.

**What did the independent approval policy decide?** It was frozen in Amendment A1 and is
deterministic; it was not applied to a model proposal. The COG-6 policy exercise on frozen inputs is
not an Agent handoff.

**R5: BLOCKED.**

## G. Executed continuation

**Which model-originated proposals reached legitimate Work?** None.

**Which effects were executed?** None in C6-R. The deterministic COG-6 chain remains the last
executed product path: operator-authored intake → `ATTEMPT_RESULT` → Promotion → blocked
reconciliation → `INCOMPATIBLE` assessment → service-minted rework → new result → Promotion →
`TASK_SATISFIED`. It is inherited evidence, not a C6-R Agent result.

**Did Settlement, Promotion and Head Reconciliation complete?** In the inherited COG-6 mechanism,
yes. In C6-R, no new chain ran.

**Did the project goal remain distinct from the completed investigative work?** In the inherited
state, yes: the negative deliverable is accepted Work; Site B still has no compliant vendor and the
goal is not marked achieved. C6-R did not change it.

**Was any unsafe or redundant work observed?** No new work was executed.

## H. Fresh-session continuity

**Did P3/F2 use genuinely new Sessions?** **NOT EXERCISED.** No session.

**Did they recover the accepted Candidate A state?** Not observed.

**Did they understand Candidate B's separate unaccepted status?** Not observed. The T2 release
mechanism is implemented and tested; no model saw T2.

**Did they preserve the validity of the prior negative finding relative to A?** Not observed. The
durable state and the rejected-proposal/open-question negative controls are present.

**Did they choose justified next actions?** Not observed.

**R6: BLOCKED. H6-F: NOT EXERCISED.**

## I. Comparative value

**Did both P and F complete matched phases?** No model ran in either. The **worlds** are matched:
8/8 equivalence dimensions identical, 0 confounders (goal, requirements, historical deliverable
digests, READY work, journal facts, inbox visible-set digest, source tree, observation time).

**Was information exposure equivalent?** The staged worlds are mechanically equivalent. No model
condition was run, so no exposure was exercised.

**Were model capabilities comparable?** The same model family and runtime configuration were
prepared; no model request reached the provider.

**What were the differences in decision quality, authority discipline, human coordination, redundant
work, tokens and elapsed time?** **Unmeasured.** The metric table is empty by construction.

**Is any superiority established, merely suggested, or entirely unmeasured?** Entirely unmeasured.
No superiority, efficiency or cost claim is made.

**R7: BLOCKED. H6-V: NOT EXERCISED.**

## J. Architecture recommendation

### Primary recommendation: **F — the evidence is still incomplete.**

The exact blocker is **not** the product mechanism and **not** a missing orchestration feature. It is
the provider path from the qualified isolated runtime:

- the single probe started the real runtime, activated `workspace-write`, and logged the real tool
  catalogue;
- six adapter attempts (five retries) all returned `502 read ECONNRESET`;
- WSL resolves the provider to the host proxy's fake-IP `198.18.0.38`; TCP 443 connects and TLS does
  not complete;
- no assistant turn, no reported tokens, no quota response, no cognition;
- the probe harness also has a WSL `git` identity-read defect; it is recorded, not patched after the
  Code Freeze.

The deterministic preparation is materially stronger than COG-6: T1/T2 are real, the P/F worlds are
fact-matched with zero confounders, the real Palimpsest host boots over P1 with 20 tools, the sandbox
boundary is measured with canaries, usage is read from session streams, the budget's process-group
kill is proven, and the COG-6 provenance ambiguity is corrected forward. None of that substitutes for
a model turn.

**The smallest decisive experiment that remains:**

1. Make the provider reachable from the isolated runtime — the owner's network/proxy configuration
   must allow the WSL guest to complete TLS to the authorized endpoint, or the owner must provide an
   approved reachable endpoint. Do not switch model families.
2. Under a **new Code Freeze**, fix the probe's WSL identity read (read the code identity in the
   repository's own Git context or pass it from the host) and re-run exactly one frozen availability
   probe. If it is still blocked, stop and report.
3. If available, run **one** P1 discovery session against the frozen T1 world and score H6-D/H6-P/
   H6-A. If it does not discover or propose, preserve the failure and stop.
4. Only then run F1, then P3/F2 for fresh continuity and H6-V.

Do not add a router, ticket database, subscription engine, watchdog, second head authority, scheduler
or another agent runtime. The bottleneck measured here is a reachable provider and a real model turn,
not missing orchestration machinery.

---

## Gate verdicts

| gate | verdict | basis |
| --- | --- | --- |
| **R0 — Evidence provenance** | **ESTABLISHED** | A/B/rubric timing/source identities distinguished from code and preserved evidence; forward erratum; committed-blob collector regression |
| **R1 — Scenario validity** | **ESTABLISHED** | T1 hides B and the duplicate; T2 releases them unaccepted; P/F share T1; 15 visibility/digest/immutability tests |
| **R2 — Runtime safety** | **ESTABLISHED (isolated runtime)** | real preset activation, oracle/`/mnt`/`/home` unreachable, write denials, self-escalation refused, env scrubbed, provider-only egress; Windows host explicitly excluded for read isolation |
| **R3 — Experiment runner readiness** | **ESTABLISHED** | P/F equivalence 8/8, 0 confounders; neutral P1 initializer; real P host boot; reuse-refusing state machine; usage/termination tested |
| **R4 — Matched natural discovery** | **BLOCKED** | provider TLS reset before any response; no assistant turn |
| **R5 — Authorized project evolution** | **BLOCKED** | no Agent proposal, so no operator decision or effect |
| **R6 — Fresh-session continuity** | **BLOCKED** | no new Session; T2 mechanism ready but unexercised |
| **R7 — Comparative value** | **BLOCKED** | matched worlds, no model pair; no superiority claim |
| **R8 — Engineering and research integrity** | **ESTABLISHED** | exact baseline and branch; Code Freeze; build/architecture/public API/targeted tests; budget evidence; protected resources unchanged; no PR or `main` movement; hashed evidence manifest |

## Preserved negative findings

1. **No real model turn.** The provider was reset at TLS; the mock runtime qualification is not
   cognition.
2. **No P1/F1 discovery, proposal or authority observation.**
3. **No T1 evolution, fresh session or comparison.**
4. **The Windows host is not safe for read confinement.** Its ACL backend restricts writes only; it
   is excluded rather than relied on.
5. **The isolated runtime's network path to the provider is broken by the host's fake-IP proxy.** This
   is an environment blocker, not a quota result.
6. **The probe harness has a WSL Git identity-read defect.** It is recorded, not patched after the
   Code Freeze.
7. **The last recorded provider status is still COG-6's `QUOTA`.** C6-R did not re-establish it.
8. **The P1/F1 scored launch path was not exercised with a model.** Only the probe and the labelled
   mock qualifications ran.
9. **The mock qualification's 2,070 tokens are synthetic.** They are not model usage.
10. **Node is `v24.14.1` while the package declares `>=24.15.0`.** The warning is preserved.
11. **The public repository is network-reachable in principle.** The isolated runtime blocks it and
    permits only `POST /v1/messages`; the oracle itself is never copied into the sandbox.
