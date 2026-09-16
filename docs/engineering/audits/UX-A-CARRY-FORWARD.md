# UX-A — Carry-forward

Baseline: `437d1c9a6e1dc9a9ff36754096aaad98e787a184` (canonical main after G10-AE-R).
Stage: **UX-A — One-Request Local Multi-Agent Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-A.md` §36 (the CF-AE-R-05 disposition) and §45 (no new kernel
semantic species).

This document records what UX-A leaves open, each with a **concrete trigger**, and
the strategic rule that governs the next stage. Nothing here is a delivered claim.
The companion dispositions are `docs/engineering/audits/UX-A-INTERACTION-ANTI-WASTE.md`
(residual costs) and `docs/engineering/audits/UX-A-DELIVERY.md` (limitations).

## 1. Mandatory: `CF-AE-R-05` is NOT closed by UX-A

```text
CF-AE-R-05 → carried to UX-B trigger
```

`CF-AE-R-05` is the AE-R evidence/boundary item: the claim that a federation path
beside an installed Project Workspace cannot cross the workspace boundary was **never
tested**, because the AE-R rig composes no federation surface
(`docs/engineering/audits/G10-AE-R-CARRY-FORWARD.md` §1; `CF-AE-R-05`).

UX-A does **not** close it, and nothing in the UX-A document set may say it does.

- UX-A is **local**. Its collaboration service composes the advisor, the existing
  compiler, the existing execution service, the ReasoningCell accepted frontier and
  the Project Verification runtime — no federation
  (`src/interaction/collaboration.ts:82-99`; anti-waste §9 proves
  `grep -rn "federation" src/interaction/` is empty).
- UX-A **does not compose federation as an execution path**. On a COORDINATE
  recommendation it returns `CROSS_PROJECT_REQUIRED` and executes nothing
  (`src/interaction/collaboration.ts:478-496,1008-1016`).
- Therefore UX-A's `CROSS_PROJECT_REQUIRED` tests (UXA-N12/N13/N14) prove that the
  **handoff seam mutates nothing**. They do **not** prove a boundary holds across a
  real peer exchange, because no peer exchange happens.

**Trigger.** UX-B must run a **real federation + shared Project Workspace rig** and
prove the boundary. Until that rig exists and runs, `CF-AE-R-05` stays open exactly
as AE-R left it.

**Trigger detail.** The rig must compose the §132–§135 peer wiring (local peer,
transport, peer directory, route) *together with* a shared Project Workspace store
holding more than one project, and assert that a federation-mediated read/write
cannot address a foreign project's workspace scope. That is the first deployment
shape in which the property is testable at all.

## 2. Items this stage leaves open

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| **CF-UXA-01** | kernel gap | **The kernel has no branch ceiling.** The only `branchCount` rule in the compiler is a minimum ("safe integer >= 2", `src/recipes/compiler.ts:79-87`); there is no maximum. UX-A introduces its own `MAX_BRANCH_HINT = 8` (`src/interaction/intent.ts:43-55`) and refuses out-of-range hints, so the *product* layer is where fan-out is bounded today. Spec §26 assumed an existing bound to reuse; there is none. | A second product face (or an expert caller) that wants to request a branch count, or any decision to move fan-out governance into the kernel/compiler rather than the interaction layer. |
| **CF-UXA-02** | capability gap | **AUTO cannot choose EXPLORE without a composed advisor.** The advisor is installed only when an organization-memory store is supplied (`src/install.ts:1582-1585`), and it needs that store to read the empirical architecture rules. On a plain install AUTO is always FOCUS (`src/interaction/collaboration.ts:450-457`). This is the honest §7 fallback, but it means the headline "Palimpsest decides" is only as capable as the deployment's advisor. | A deployment that wants AUTO (or the §33 AUTO→EXPLORE scenario) on an install without an organization-memory store — i.e. the first host that expects automatic architecture selection without wiring org memory. |
| **CF-UXA-03** | boundary/UX-B | **The COORDINATE handoff is a signal, not a protocol.** UX-A produces `CROSS_PROJECT_REQUIRED` with the peer ids from the advisor's own `existingSubjectRefs` and a plain-language reason (`src/interaction/collaboration.ts:478-496`). There is no discovery, no scoped context packaging, no commitment request and no transport. UX-B owns all of that. | The first request that must actually reach another project and return a result — i.e. UX-B's `ask the previous optics project about this` target (spec §44). |
| **CF-UXA-04** | product adaptation | **The deterministic profiler is lexical.** `deterministicTaskProfiler` matches explicit keyword markers only (`src/interaction/host_adapter.ts:153-214`); a paraphrase with no marker stays `UNKNOWN`, and an ambiguous sentence is deliberately not guessed. AUTO/PARALLEL therefore reach EXPLORE only when the task text contains the profiler's vocabulary. | A host that wants model-backed profiling (the `TaskProfilerPort` seam), or a measured case where a real user sentence profiles to all-UNKNOWN and AUTO therefore stays FOCUS when EXPLORE was warranted. |
| **CF-UXA-05** | honesty/projection | **Claim content is projected verbatim.** A finding's `content` is copied straight from the admitted claim (`src/interaction/result_view.ts:48-59`). If a branch execution port writes internal plumbing into its statement — the branch question itself carries the suffix built at `src/recipes/execution.ts:243` (`` `${branchQuestion} [branch ${i+1}/${n}]` ``) — that plumbing appears in the user-facing finding. The suite's branch port deliberately does not echo it, so UXA-N16 passes; a naive port would not. | A branch execution port whose output echoes its input question, or a report of a finding whose content visibly contains `[branch k/n]` machine text. |
| **CF-UXA-06** | API hygiene | **CLOSED IN UX-A (gate review MAJOR-3).** `verifierRef` reached the compiler only through `CHECK`, so `PARALLEL_AND_CHECK` and the durable-VERIFY rider silently bound the compiler's `project-default` sentinel — a protocol the caller never named. `explorePlan` now carries the ref whenever VERIFY is present, and the regression uses a MIXED verifier registry (an independent default plus a shared-context ref) so a REVERT now fails the suite; the single-verifier rig it replaced could not detect one. | Closed. |
| **CF-UXA-07** | API hygiene | **`ArchitecturePreferences` is an inert argument today.** UX-A builds and passes `preferences` from the durable work-mode preference (`src/interaction/collaboration.ts:293-299`), but the advisor declares `preferences?` and never reads it (`src/advisor/advisor.ts:115`; `grep -n "\.preferences" src/advisor/advisor.ts` → no use). The field is a forward seam only; UX-A consumes the durable preference itself for the VERIFY rider. | The first advisor rule that actually consults `preferences` — i.e. a decision to make durable posture influence architecture selection rather than merely inform the VERIFY rider. |
| **CF-UXA-08** | HTTP semantics | **CLOSED IN UX-A.** A malformed collaboration body returned 500 because `CollaborationError` exposed only `reason` and the shared mapper keys on `kind`. The class now reports the same value under both names, so `invalid_request`/`invalid_branch_count`/`invalid_intent` answer 400 and only `not_configured` (a server condition) stays 500. Pinned by the suite. | Closed. |
| **CF-UXA-13** | API symmetry | **`plan()` REJECTS on an infrastructure fault while `run()` returns an `ERROR` envelope.** Found by the gate review (NIT-8). Deliberate: a read has no result envelope to fill, and a rejection is not a semantic verdict — the review's own finding was the opposite direction (an error envelope must not carry a structural verdict, now fixed by the `"ERROR"` execution kind). | A host that wants to branch on failures of `plan()` without a try/catch, or a decision to give the plan view a status field. |
| **CF-UXA-14** | API hygiene | **`taskProfileOverrides` are inert for FOCUS and CHECK.** Found by the gate review. Intent FOCUS never profiles (no boundary is created) and CHECK profiles nothing (it verifies the project head), so the overrides have nothing to refine; AUTO/PARALLEL/PARALLEL_AND_CHECK do apply them. | A product decision to use declared profile values for FOCUS/CHECK, or a caller that passes overrides expecting them to be validated for those intents. |
| **CF-UXA-09** | spec ambiguity | **The COORDINATE rule is reachable via AUTO only.** The `CROSS_PROJECT_REQUIRED` branch keys on the advisor's `recommendedPlan` being `coordinate.v1` (`src/interaction/collaboration.ts:475-496`). `PARALLEL` and `PARALLEL_AND_CHECK` consult the advisor but honour the user's explicit local request and do not re-check for COORDINATE (`:568-628`, `:673-760`). Spec §14 scopes the rule to AUTO; §2/§34's wording is broader; only AUTO is tested (UXA-N12). | A deployment that wants an explicit `PARALLEL` request to be refused or redirected when the advisor recommends COORDINATE, or a decision to broaden §14's scope to every advisor-consulting intent. |
| **CF-UXA-10** | coupling | **UX-A reads the advisor's blocker wording.** `reasoningCapabilityFrom` learns "no branches" by regex-matching the advisor's blocker text (`/reasoning branches capability is not available/iu`, `src/interaction/collaboration.ts:236`). That is reading the advisor's own output, not duplicating its policy — but it couples the interaction layer to a human-readable string. | Any change to the advisor's blocker wording, or the introduction of a typed capability/blocker code on the recommendation. |
| **CF-UXA-11** | product adaptation | **`taskProfileOverrides` are inert for FOCUS and CHECK.** Profiling runs only in the AUTO/PARALLEL/`PARALLEL_AND_CHECK` paths (`src/interaction/collaboration.ts:275-285`); FOCUS and CHECK never profile, so their overrides are parsed and discarded. Low impact (those intents consume no profile), but not obvious from the request shape. | A caller that supplies overrides with FOCUS/CHECK expecting an effect, or a future intent that consumes a profile for a focus-only path. |
| **CF-UXA-12** | scope/evidence | **UXA-N25…N30 are gate-level, not in-suite.** The stage's suite covers UXA-N01…N24; the cross-stage regressions (AE-R, AE bridge, AD, AC-R, AB, W/X/Y/Z/AA) are proven by the full vitest/Playwright runs, not inside this suite. No document in this set may describe them as in-suite assertions. | The §42 gate run, and any later stage that wants to cite UX-A as evidence for those planes. |

## 3. What this stage does NOT leave open

The following are delivered and pinned, and are not carried:

```text
one-call local golden path            UXA-N21
FOCUS creates zero boundary           UXA-N09
bounded ephemeral PARALLEL            UXA-N05
CHECK uses only the real runtime      UXA-N07/N08
honest CAPABILITY_REQUIRED            UXA-N06/N08
COORDINATE mutates nothing            UXA-N12/N13/N14
no CoT / ids under details            UXA-N16 / §18 project
no ProjectIR / Journal promotion      UXA-N19/N20
no posture or involvement mutation    UXA-N02/N03
bounded hint, explicit refusal        UXA-N23
ERROR != semantic failure             UXA-N24
no new store / event / authority      anti-waste §1-4
architecture selection still advisor  anti-waste §5; UXA-N04
compilation still recipe compiler     anti-waste §6
```

## 4. Strategic rule (spec §45)

```text
From UX-A onward:
NO NEW KERNEL SEMANTIC SPECIES
unless a real interaction use case proves the existing kernel cannot express it.
```

UX-A is the first stage under this rule, and it honours it: it added an interaction
layer of five modules and modified four product faces, and it introduced no new
canonical plane, store, authority species, Agent ontology, scheduler or durable
collaboration protocol. Every item in §2 above is either a missing kernel bound
(`CF-UXA-01`), a deployment capability gap (`CF-UXA-02`), a UX-B boundary
(`CF-UXA-03`), product adaptation (`CF-UXA-04`, `CF-UXA-11`), an honesty/API
observation (`CF-UXA-05`…`CF-UXA-10`), or a scope/evidence statement
(`CF-UXA-12`). None of them proposes a new kernel species; several propose that the
existing kernel should expose a bound or a typed code it currently does not
(`CF-UXA-01`, `CF-UXA-10`) — which is exactly the evidence the strategic rule asks
for before a species is considered.

The next stage is **UX-B — One-Request Cross-Project Collaboration** (spec §44). It
must also prove/close the real trigger behind `CF-AE-R-05` by composing federation
and a shared Project Workspace in one adversarial rig (§1 above). PIAS remains a
separate product track and is not a Palimpsest kernel dependency for UX-A or UX-B.

## 5. Honest limitations of this carry-forward

1. **`CF-AE-R-05` remains open and is stated plainly.** HONEST: UX-A's local
   COORDINATE tests are not evidence about federation boundaries. No UX-A document
   may describe them as such.
2. **No item above is closed by assertion.** Each names a trigger; an item moves only
   when its trigger fires (the AE-R §24 discipline).
3. **The cost items are costs, not defects.** `CF-UXA-01`, `CF-UXA-06` and
   `CF-UXA-08` are recorded so the true price of the product layer — and the exact
   place where the kernel or the HTTP face would need to change — is on record.
