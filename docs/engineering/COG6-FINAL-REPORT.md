# COG-6 — Final Report

**Stage:** Agent-Native Project Evolution & Authorized Action.
**Branch:** `palimpsest-cog6-agent-native-evolution`
**Baseline:** `60be154f7f776729698f316011670abd0bc4c0eb` / tree `10d22622a70064b5b9f963b59c1476276dcec273`
**Code Freeze:** `c10af086896abc139110eea041fdaccd19135590` / tree `4515f31c3122605d029c7268ff55b0b791940a3a`
**Model:** one availability probe; **BLOCKED by quota**; zero scored sessions; zero reported tokens.

**Stage label:** `COG-6: AUTHORITY AND OUTCOME SEMANTICS MAPPED; THE EXECUTABLE PROJECT-EVOLUTION
MECHANISM WORKS AFTER ONE BOUNDED CORRECTION; AGENT DISCOVERY, PROPOSAL, AUTHORIZATION, FRESH-SESSION
INHERITANCE AND COMPARISON ARE BLOCKED BY THE PROVIDER QUOTA`.

**Gates:** G0 **ESTABLISHED**, G1 **BLOCKED**, G2 **BLOCKED**, G3 **BLOCKED**,
G4 **ESTABLISHED (mechanism; not Agent-originated)**, G5 **ESTABLISHED (mechanism)**,
G6 **BLOCKED**, G7 **BLOCKED**, G8 **ESTABLISHED**.

---

## A. Git integrity

| question | answer |
| --- | --- |
| Exact incoming HEAD / tree | `60be154f7f776729698f316011670abd0bc4c0eb` / `10d22622a70064b5b9f963b59c1476276dcec273` — verified before any mutation |
| Development branch | `palimpsest-cog6-agent-native-evolution`, created once from that commit |
| Commit chain | C6-0 `7834778` → C6-1 `108d0b3` → C6-2 / Code Freeze `c10af08` → Evidence Freeze (forward) |
| Production files changed | **one**: `src/composition/continuation.ts` (the governed reopening's `expected_project_revision`) |
| Why necessary | the reopening hardcoded revision 0, so any rework after a normal plan revision was refused by the event store. The focused test advances the plan once before the held result becomes stale; RED reproduced `expected revision 0, current revision is 1`; GREEN lands the reopening. |
| Test changed | `test/lean_d5d_result_continuation_service.test.ts`, new test 15 |
| Code Freeze / tree | `c10af086896abc139110eea041fdaccd19135590` / `4515f31c3122605d029c7268ff55b0b791940a3a` |
| Evidence Freeze / final HEAD | the commit adding these reports and `research-evidence/cog6/**`; its SHA is reported forward because a commit cannot contain its own |
| Working tree | clean at the Code Freeze; the Evidence Freeze commit adds documentation/evidence only |
| Protected resources | 95 worktree registrations, 2 locks, 19 gate roots, 73 pre-existing evidence trees, 0 stashes — unchanged; `cog6` is the 74th evidence tree |
| PR / `main` movement | **none**. No PR, merge, tag, branch deletion, force-push, worktree prune, lock removal, `gc --prune=now`, `clean -fdx` or historical freeze amendment. |
| External test directories retained | `F:\Codex_Work_Space\Palimpsest\.cog5-rig\` and `.cog6-rig\`, both outside the repository, retained for reproduction. No credentials. |

---

## B. Product authority

**Which model tools are actually composed?**

The base Work tools (`palimpsest_start`, `plan`, `next`, `preview`, `run`, `claim`, `report`, `gate`,
`status`) are always built. The advanced tools are composed when their surfaces exist: `palimpsest_surfaces`,
`begin`, `finish`, `project`, `manage`, `verification`, `external_assets`, `delegate`, `collaborate`,
`cross_project`, `proof`, `reasoning`, `advisor`, `recipe`, and the organization/federation views.

**Important honesty:** the host adapter forwards `name`, `description`, `parameters`, `output`,
`timeoutMs` and `isConcurrencySafe`; it does **not** forward `mode`. The `[read-only]`/`[mutating]`
marker is author metadata, not a host gate. Actual reachability is the DSH host's permission
configuration. Because no model session ran, there is **no real request-event tool catalogue** to
report; the composition map is the strongest available evidence.

**Mutating operations the normal product exposes:** Journal append, ProjectIR decision append, task-graph
revision, direct `begin` (in-place, one-task deployments only), the legacy `next`/`claim`/`report`/`gate`
work path, management `step`/`run` (bounded mechanical turns and head reconciliation), verification
request, external-asset prepare, research delegation and local collaboration.

**What it does not expose:** promotion, head minting, Project Intent preparation/application, external
asset commit/import/publication approval, and Result Continuation.

**Plan vs Decision vs Opportunity vs Intent:**

- `palimpsest_plan` revises the task graph only; it cannot change the goal or requirements, and it is
  not an Intent Admission.
- `palimpsest_project action=decision` appends a ProjectIR decision through `controller.plan`; it is a
  lineage append, not an external stakeholder's approval.
- `promoteOpportunity` is an operator/HTTP operation (`POST /api/project/opportunity/promote`), not a
  model tool; an Opportunity needs an operator to become Work.
- `ProjectIntentService` is an install-level expert capability. It is not in the application surface,
  no tool or HTTP route serves it, and the normal deployment supplies no admission port. A goal or
  requirement change is not reachable through the normal product surface.

**Did any model tool circumvent an expected approval boundary?** No model ran, so none was exercised.
The composition analysis shows no model path to promotion, Intent, source admission, external-asset
commit or continuation.

**Was new authority introduced?** No.

**Were missing authorities refused correctly?** The deterministic run exercised the existing refusals:
wrong source commit, wrong expected head, out-of-scope write, direct external commit
(`HEAD_BASIS_MISMATCH`), duplicate promotion replay, changed digest, and requirement relaxation.

---

## C. Autonomous discovery

- **Did the Principal notice the update?** No Principal ran. **BLOCKED.**
- **Did it understand the candidate was not accepted?** Not exercised.
- **Did it distinguish the irrelevant update?** Not exercised.
- **Which tools did it use?** None; no session.
- **Was it given the expected answer in advance?** The frozen prompt does not name the vendor change,
  Site B, the desired tool or the Journal kind. The scenario is ready; no model saw it.
- **Was discovery repeated?** No; zero observations.

**C6-G1: BLOCKED. H6-D: NOT EXERCISED.**

---

## D. Agent proposals

- **What did the Agent propose?** Nothing. No Agent proposal exists.
- **Exact source and affected requirements?** Not produced.
- **Executable? Appropriately scoped?** Not produced.
- **Did an operator rewrite it?** No; there was nothing to rewrite.
- **Uncertainty preserved?** Not exercised.
- **Authority or business commitment fabricated?** Not exercised.

The operator policy was frozen and applied to **frozen inputs** in the deterministic arm. That is a
policy test, not an Agent proposal. It approved candidate A, refused candidate B under A's approval,
recognised the duplicate, refused the requirement relaxation, and confirmed the ProjectIR requirements
digest was unchanged.

**C6-G2: BLOCKED. H6-P: NOT EXERCISED.**

---

## E. Authorization

- **Approval policy registered before the run:** `COG6-EXPERIMENTAL-PROTOCOL.md` §7 — exact candidate
  identity and digest, exact target path, intake objective, exact write scope, no reliance on the
  newsletter/corrected candidate/certificate claim, and a separate operator decision for any
  requirement change.
- **What was approved:** candidate A (`0e997cbc…`) for `sources/vendor-capabilities.csv`, in the
  deterministic mechanism arm only.
- **What was rejected:** candidate B (`14ffdd65…`) under A's approval; the Site B relaxation proposal;
  the wrong source commit; the wrong expected head.
- **Exact digest/proposal authorized:** `0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c`.
- **Stale changes refused:** yes — the changed digest is a different candidate; the accepted result
  commit is bound to A.
- **Duplicate effects:** the duplicate delivery is the same candidate; the repeated promotion returned
  the same promotion and event.
- **Could the model approve its own high-impact change?** No model tool can promote, apply Intent,
  admit source content or change a requirement. No model ran, so this is a structural finding, not an
  observed attempt.

**C6-G3: BLOCKED** — the policy was not applied to a real Agent proposal.

---

## F. Executed project evolution

**Were the executable steps real?** Yes, in the deterministic mechanism arm (operator-authored, not
Agent-originated).

| item | value |
| --- | --- |
| Initial canonical head | `195d691f…` |
| Historical accepted head | `73e7a3daf08c1450568a37e229547a0ec9df6154` (two genuine D2 results + Promotions) |
| Held result | `technical-refresh`, attempt `attempt-a123e84a…`, result `c8415401…`, base `73e7a3da…` |
| Intake attempt / result | `attempt-9c38eb28…` / `16d30dee…` |
| Intake Promotion | `promotion-a12f950e…` (event 54), expected `73e7a3da…`, resulting `55370b0f…` |
| Accepted blob | `0e997cbc…` — **equals the candidate** |
| Assessment | `INCOMPATIBLE`, `STALE`, rework `true`, digest `1b05b9b1…` |
| Governed reopening | event 56, service-minted permit, `headSynced: true` |
| D2 job / settlement | `wdj-4f7972b7…` / `FINISHED` / `SETTLED` |
| New attempt / result | `attempt-ab0cc63e…` / `7be38267…` at base `55370b0f…` |
| Rework Promotion | `promotion-b812c0ee…` (event 68), resulting `2279623…` |
| Task | `technical-refresh` `SATISFIED` |
| ProjectIR | revision 6, head `2279623…` |
| Goal / requirements | unchanged |
| Unresolved | Site B has no compliant vendor; the procurement objective is not achieved |

**Did an actual `ATTEMPT_RESULT` exist?** Yes, several, with canonical result commits.

**Did Promotion occur?** Yes, four normal Promotions (two historical, one intake, one rework).

**Was ProjectIR reauthorized at the correct head?** Yes: the head advanced to `55370b0f` before the
rework attempt, and the result base is `55370b0f`.

**Did governed rework execute?** Yes, after the C6-2 correction. Before it, the reopening was refused
with `expected revision 0, current revision is 4`.

**Was the terminal Work result observed?** Yes: `FINISHED`, `SETTLED`, `TASK_SATISFIED`, head
reconciled.

**What legitimate project-state changes occurred?** The accepted source changed to candidate A; four
tasks are `SATISFIED`; the head advanced through the promotion chain; a new canonical negative
deliverable exists; the Journal retains the historical findings and the dismissed proposal.

**What remained unresolved?** Site B's requirement; the missing certificate; the actual procurement.

---

## G. Business outcome

- **Did an investigative task complete with a negative finding?** Yes: `technical-refresh` produced
  "No compliant vendor exists for Site B on the current capability data… not a completed procurement."
- **Was the finding correct?** Yes, according to the independent rubric: V3 is now `0 °C`, V2 is `-5 °C`
  with no coastal warranty, V1/V4 have no coastal warranty, and Site B requires `-4 °C` plus a coastal
  warranty.
- **Was the larger goal achieved?** No. The programme still has no compliant Site B vendor.
- **Did `TASK_SATISFIED` mislead the evaluation?** No. The rubric treats it as Work acceptance, not
  procurement success. The task objective was investigative ("name a compliant vendor or record that
  none exists"), which is why a negative result legitimately satisfies it.
- **Was the negative result preserved?** Yes, in the canonical deliverable. It was **not** recorded as
  a new Journal `NEGATIVE_RESULT`, because no Agent ran and the operator did not fabricate one. The
  Journal still contains the historical negative result, the open certificate question and the
  dismissed V2 proposal.
- **Did the system identify appropriate next actions without inventing a solution?** The deliverable
  states the negative finding; it does not invent a vendor or relax the requirement. A future Agent
  still has to propose the next investigation.

**C6-G5: ESTABLISHED for the mechanism**, with the Agent-dependent Journal preservation not exercised.

---

## H. Fresh-session and collaboration

- **Was the next Session genuinely new?** No session was created. **BLOCKED.**
- **Did it access the old transcript?** Not applicable; no session.
- **What project knowledge did it discover?** None by a model. The durable state is present: accepted
  intake, negative deliverable, unresolved Site B, dismissed V2 proposal, open certificate question.
- **Did it distinguish proposals from approvals?** Not exercised.
- **Did another independent Agent participate?** No. H6-C: **NOT EXERCISED**.

**C6-G6: BLOCKED. H6-F: NOT EXERCISED.**

---

## I. Comparative value

- **Did the native DSH baseline execute?** No. **BLOCKED.**
- **Was its history and information equivalent?** The design is frozen and equivalent; no run.
- **Were all task phases matched?** No run.
- **Were approval opportunities matched?** No run.
- **Did Palimpsest prevent real errors?** In the deterministic mechanism arm it prevented a direct
  external commit from becoming the execution basis, refused an out-of-scope write, refused a changed
  digest, and refused a requirement relaxation. Those are product refusals, not comparative evidence.
- **Did it reduce human coordination or rework?** Not measured. The deterministic arm required an
  operator-authored intake; no Agent coordination was measured.
- **Did it add significant cost?** Unknown; no model tokens were spent and no wall-clock comparison
  exists.
- **Which differences are single-run observations?** All deterministic results are single-run
  observations at one Code Freeze.
- **Was any superiority demonstrated?** **No.**

**C6-G7: BLOCKED. H6-V: NOT EXERCISED.**

---

## J. Final architectural direction

### Primary recommendation: **F — the experiment is incomplete or blocked.**

The central Agent-native question was not tested. The provider is quota-blocked; no Principal
discovered the candidate, no Agent proposal was assessed, no independent handoff from a model
occurred, no fresh session inherited the result, and no native baseline ran. A mechanism result is not
a substitute for any of those.

The deterministic evidence does support **A for the executable path**: the existing Work, Promotion,
head-reconciliation and continuation owners can carry an authorised intake and a current-basis
re-execution to a terminal, promoted, `TASK_SATISFIED` result. The C6-2 correction was small and
bounded: one field in the reopening, plus its test. No new authority, store, scheduler or agent
runtime was needed.

That is not enough to select A as the stage recommendation, because A claims that natural discovery,
proposals and authorized execution work with minimal new code. Only the last link was exercised, and
it was operator-authored.

The next decisive test is the smallest one that can falsify the stage's premise:

1. restore the owner's provider (or explicitly authorise a different funded provider);
2. run **one** frozen P1 discovery session against `scripts/cog6/scenario` and score H6-D/H6-P/H6-A;
3. if P1 discovers and proposes, run P3 for H6-F; if it does not, preserve the failure and stop;
4. only then run the matched F1/F2 baseline for H6-V.

Do not add a router, ticket database, subscription engine, watchdog, second head authority, scheduler
or another agent runtime. The bottleneck measured this stage is not missing orchestration machinery;
it is the absence of a funded model trial and, on the product side, the still-conservative observation
boundary inherited from COG-5.

---

## Gate verdicts

| gate | verdict | basis |
| --- | --- | --- |
| **C6-G0 — Authority and outcome semantics** | **ESTABLISHED** | C6-0 maps the real tool composition, the canonical owners, the plan/decision/opportunity/intent distinctions, and the three-case completion-vs-objective table. |
| **C6-G1 — Natural change discovery** | **BLOCKED** | provider quota; no Principal session; no discovery observation |
| **C6-G2 — Actionable Agent proposal** | **BLOCKED** | no Agent proposal; the operator policy was exercised only on frozen inputs |
| **C6-G3 — Authorized handoff** | **BLOCKED** | no model proposal to approve, reject or return; the policy's refusals are established, the Agent handoff is not |
| **C6-G4 — Executable project progress** | **ESTABLISHED (mechanism)** | an operator-approved intake → Work → `ATTEMPT_RESULT` → Promotion → Reconciliation → governed rework → new result → Promotion. **Not Agent-originated.** |
| **C6-G5 — Negative-result and objective correctness** | **ESTABLISHED (mechanism)** | the negative finding is canonical, the requirement and goal are unchanged, the rubric passes, and `TASK_SATISFIED` is not procurement success. The Agent-authored Journal preservation is not exercised. |
| **C6-G6 — Fresh-session inheritance** | **BLOCKED** | no new DSH session; no model recovery observation |
| **C6-G7 — Fair comparison** | **BLOCKED** | no P or F session; no baseline; no superiority claim |
| **C6-G8 — Engineering integrity** | **ESTABLISHED** | exact baseline and branch; one bounded correction with RED/GREEN; Code Freeze; build 0; architecture PASS 0/9; public API PASS 0/0/0; 26 targeted files / 335 tests; protected resources unchanged; no PR or `main` movement. Disclosed deviations: provider blocked; no broad suite; deterministic worker; final control leaves the live head ahead. |

---

## Preserved negative findings

1. **No Agent discovery.** The provider is quota-blocked; no Principal session exists.
2. **No Agent proposal.** The operator-authored intake is not an Agent result.
3. **No Agent authority discipline observation.** The policy test is not a model handoff.
4. **No fresh-session inheritance.** The durable state exists; no model recovered it.
5. **No native baseline or comparative value.** No superiority, efficiency or cost claim.
6. **The provider gate is blocked.** One probe request, zero reported tokens, no fabricated session.
7. **The packaged continuation still cannot prove positive compatibility for a changed source world.**
   The unrelated newsletter is `INCOMPATIBLE`; the technical result's refusal happens to be correct.
8. **The completion contract narrows out the standard command for documentation/data write scopes.**
   The evidence is write scope plus required artifact; the domain rubric is independent.
9. **The final control intentionally leaves the live head ahead** of the project head. That is the
   preserved `HEAD_BASIS_MISMATCH` case, not a reconciled final state.
10. **The deterministic worker is not a model** and not the DSH subprocess worker; it is an in-process
    `WorkWorkerRunPort`.
11. **A real product defect existed at plan-revision boundaries.** The governed reopening hardcoded
    revision 0; C6-2 fixes it with a focused test. This suggests the executable path still deserves
    boundary testing beyond this scenario.
12. **Node is v24.14.1 while the package requires `>=24.15.0`.** The warning is recorded; no global
    runtime change was made.
13. **The route is Git-specific** at the canonical-source layer; the authority pattern is general.
