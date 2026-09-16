# UX-C — Host runtime assessment (UXC0)

Baseline: `a36d37b13b5fb9f28ef77b07657aaf728ab1cb45` (canonical main after UX-B).
Stage: `UX-C — Host-Native Zero-Config Collaboration Runtime` (product track).
Spec: `SPEC-PROMPT-UX-C.md` §5 mandates this audit — 20 questions, no implementation until
it is committed.

Method: read the whole host path — `src/install.ts`, `src/deployment/{profile,launch}.ts`,
`src/advisor/**`, `src/interaction/**`, `src/recipes/**`, `src/reasoning_cell/**`,
`src/attention/**`, `src/transport/**`, `src/federation/**`, `host/dsh/lib/{index,runner,startup}.js`
and both existing interaction dogfoods. Every claim below is quoted from the tree.

**Headline:** the capability exists and is correctly designed; **the shipped host does not
compose it, and where it does compose something it is unsound.** Concretely: a launched
project cannot Explore at all; the branch host is a *full principal* running the *entire*
tool surface with only prompt text restraining it; the branch and RecipeExecution **both**
own candidate submission; and the shipped host bundle hard-codes a verification policy that
returns `standing: "SUPPORTED"` with empty evidence. None of that is a kernel defect — it is
exactly the packaging gap this stage exists to close.

---

## 1. The twenty §5 questions

**Q1 — Why is Advisor gated on `organizationMemoryStore`?** A deliberate install-time gate,
not a dependency: `src/install.ts:1603-1624` builds the advisor only when
`options.organizationMemoryStore !== undefined`, with the comment "the advisor exists iff an
empirical organization-memory store is supplied". Nothing else in the wiring requires it.
This is `CF-UXA-02` verbatim.

**Q2 — Can the Advisor be composed with `memory: undefined`? Yes, safely.**
`EmpiricalArchitectureAdvisorDeps.memory` is optional (`src/advisor/advisor.ts:276-281`), it
is read at exactly one place (`:324`), and when absent the advisor sets
`empiricalSupport`/`empiricalCounterEvidence` to frozen empty arrays, skips transferability,
omits `INSUFFICIENT_EMPIRICAL_EVIDENCE`, and pushes the honest rationale *"No empirical
evaluation is available, so the recommendation rests on stated capability and task features
alone."* (`:399-401`). Architecture selection is unaffected — it depends only on the
`TaskProfile` features and `AdvisorCapabilities`. **No fabrication, no crash.**

**Q3 — What task text makes a memoryless AUTO choose FOCUS vs EXPLORE?** AUTO passes **no**
`userRequestedMultiAgent` (`src/interaction/collaboration.ts:475-478`), so EXPLORE needs
`prefersExplore = decompHigh && !couplingHigh && verifyHigh && parallelHigh`
(`src/advisor/advisor.ts:311`) — **`verifiability = HIGH` is required and the spec omits it**
(correction SC-1). Verified against the profiler's rule table
(`src/interaction/host_adapter.ts:153-214`):
- **EXPLORE:** `"Explore independent approaches to caching; separately evaluate each component and verify the trade-offs with tests."` → decomposability HIGH, coupling UNKNOWN, verifiability HIGH, parallelSearchBenefit HIGH.
- **FOCUS:** `"Apply one atomic schema migration that every module depends on; the change is monolithic and shares state across components."` → decomposability LOW, coupling HIGH, verifiability UNKNOWN.
- `existingIndependentPeers` is deliberately absent from the profiler table, so it stays UNKNOWN in both.

**Q4 — What is missing from a profile-launched Explore?** Everything on the reasoning side:
`launchDeployment` passes no `reasoningCellStore`, `reasoningVerificationPolicy`,
`reasoningAdmissionPolicy` or `reasoningBranchExecution` (`src/deployment/launch.ts:326-353`),
and `ProjectAgentDeploymentProfile` has **no field** for any of them (its parser would reject
them as `unknown_field`). So `reasoningCellsInstalled` is undefined, `recipeExecution` is
composed with `reasoning: undefined`/`branchExecution: undefined` (`src/install.ts:1629-1642`),
and `executeExplore` fails closed with `capability_required("reasoning_cell", …)`
(`src/recipes/execution.ts:217-220`). The advisor is also absent, so AUTO→FOCUS and
PARALLEL→`capability_required`. Everything else the path needs is already plumbed.

**Q5 — Does the DSH branch path write to ReasoningCell? YES.** `host/dsh/lib/index.js:74-135`
builds its own `SqliteReasoningCellStore` over the shared file, makes a real
`ReasoningCellService`, and registers `palimpsest_reasoning` with a **live `submitCandidate`**
(only `openBranch`/`evaluate`/`invalidate` are wrapped `forbidden`). `runner.js:82-90`
instructs the branch agent to call `action "candidate"`.

**Q6 — Does RecipeExecution also submit? YES.** `src/recipes/execution.ts:248-277`: after
`branchExecution.run({brief})` it extracts `statementFromOutput(output)` and calls
`submitCandidate` then `evaluateCandidate`.

**Q7 — Duplicate ownership?** See §2 — the load-bearing subsection.

**Q8 — Which tools does a branch see?** **The full principal surface**, plus the
branch-restricted `palimpsest_reasoning`. Branch mode is launched with the *same profile* as
the principal (`src/reasoning_cell/branch_execution.ts:206-209`), `index.js:67` calls
`launchDeployment(profile)` unconditionally, and `installPalimpsest.register` registers every
composed tool (`src/install.ts:2403-2413`). There is **no branch allow/deny list**.

**Q9 — Can the branch reach principal-only mutating tools? Yes, whenever the profile composes
them.** `palimpsest_manage` and `palimpsest_project` (workspace wiring), `palimpsest_cross_project`
(`projectDirectory`), `palimpsest_federation` (federation wiring), `palimpsest_proof`,
`palimpsest_disclosure`, `palimpsest_external_assets`, and — for **any** launched recipe
install — `palimpsest_verification`, because the AD runtime and its store are created by
default. The only restraint today is prompt text (`runner.js:51-52`) plus three `forbidden`
wrappers. §17's "prompt instructions alone are NOT a capability boundary" applies exactly.

**Q10 — Does branch mode launch the full deployment? YES.** `index.js:67` launches before the
mode is known; `runner.js:246-249` only then branches on `startup.mode === 'branch'`. One
ephemeral cognition therefore composes the coordination store, the durable transport, the
pump, boundary/runtime-scope/workspace/management stores, the verification runtime, the whole
application surface, an optional HTTP server, **and a second reasoning service**.

**Q11 — The narrowest safe branch contract.** In: one frozen `ReasoningBranchBrief`
(optionally wrapped with an `evidenceContext` allowlist) as `--branch <file.json>`. Out: one
`PALIMPSEST_BRANCH_RESULT` line with `{status, statement, evidenceRefs}`, then exit. Must NOT
compose the deployment, federation, transport, pump, attention, workspace, management,
proof, external assets, monitor, cross-project or any principal tool; must NOT create a
PeerRef/PersistentPoint/durable session; must NOT call any ReasoningCell method. One
host-private strict result tool is allowed.

**Q12 — Who owns the reasoning-store lifetime? Nobody.** `install.ts:366` accepts a store but
**never closes it** (`dispose()` at `:2414-2449` has no reasoning-store line), and
`launchDeployment` neither creates nor accepts one. So a caller-supplied store leaks unless
the caller closes it, and a launched deployment has none to close.

**Q13 — What does the runner duplicate from `pumpAndActivate()`?** The same four steps in the
same order with the same mark-after-success condition (`src/deployment/launch.ts:364-380` vs
`host/dsh/lib/runner.js:342-363`); the runner re-implements them with its own adapter and a
`setInterval` guard, and ignores `deployment.pumpAndActivate` entirely. Order is not the
problem — **two drifting implementations** are.

**Q14 — Can the runner supply `agents.resume()`? Yes.** `dshAgentsAttentionAdapter` accepts
`{get?, resume?}` plus a `format` seam (`src/attention/host_adapter.ts:70-88`); the runner
passes only a `get` shim whose id is ignored (`runner.js:335-338`), but the real resume-capable
`agents` service is already in scope at the loop site (`runner.js:234-235,251-259`). This is a
host wiring change, not a new API.

**Q15 — Can the cross-project formatter be composed without reading bodies? Yes, by
construction.** `crossProjectAttentionText(signal, role)` reads only `threadId`, `peer.peerId`
and `subjects[].id`; `AttentionSignal` has **no body field**
(`src/interaction/cross_project_host_adapter.ts:65-74`, `src/attention/signals.ts:32-49`). But
it is **not reachable from the host bundle**: `src/advanced.ts` (the host's `palimpsestEntry`)
does not re-export `./interaction/index.js` (correction SC-8).

**Q16 — What does CHECK verify?** The exact **current ProjectIR head** — subject kind
`CURRENT_PROJECT_HEAD` built from `{projectId, projectRevision, projectDigest, headCommit}`
(`src/project_verification/artifacts.ts:207-255`), never Explore findings. `CHECK` compiles to
`FOCUS + VERIFY` and `PARALLEL_AND_CHECK` to `EXPLORE + VERIFY` whose own comment says the
verification "is about the PROJECT HEAD, never about the reasoning claims"
(`src/recipes/execution.ts:22-24`).

**Q17 — Does any copy imply findings were verified?** No string says it literally, but
`CollaborationResult` has **no** `findingStanding`/`findingNote` field at all, and two primary
strings invite the misreading: the verb `"Explore alternatives, then check independently"`
(`src/interaction/intent.ts:262`) and the `didWhat` sentence *"read the admitted findings back
from the accepted frontier. The exact current project head was then verified by the registered
protocol."* (`src/interaction/collaboration.ts:951-956`). §13's label is missing; §14's copy
needs hardening.

**Q18 — Which safe defaults do no work until collaboration is requested?** All of them, with
two honest caveats. The advisor, the profiler, the branch port, the policies and the formatter
are inert closures; the reasoning store issues only `CREATE TABLE IF NOT EXISTS`; the AD
verification runtime registers a provider and creates a store but runs nothing; the pump is
constructed but `launchDeployment` never calls `pumpOnce`; attention derives nothing until
`drain()`; Monitor is not composed at all. The caveats: a durable store *does* create a local
file/table by existing, and the **shipped runner** polls the local mailbox on a timer.

**Q19 — What remains explicitly configured?** Cross-project **send**, Monitor ticking,
external-asset providers, external publication, `domainGate`, Proof disclosure, commitment
acceptance, and management-mode escalation — each requires an explicit operator act, and none
of them is exercised by wiring alone.

**Q20 — Which carry-forward items may close?** Exactly four, if this stage succeeds:
`CF-UXA-02` (memoryless advisor), `CF-UXB-01` (a launched project cannot Explore),
`CF-UXB-02` (the formatter is not wired), `CF-UXB-03` (no `resume` in the runner). Everything
else stays open per §54: `CF-UXA-01` (the kernel has no branch ceiling), `CF-UXA-04`,
`CF-UXA-10`, `CF-UXB-04`…`CF-UXB-07`, `CF-UXB-09`, `CF-AE-R-08`, PIAS. `CF-UXB-08` is already
closed and must not be re-closed.

---

## 2. THE LOAD-BEARING FINDING: candidate ownership overlaps

**Verdict: OVERLAP EXISTS.** Both the branch host and `RecipeExecution` call
`submitCandidate` for the same branch. The spec's §56 partial condition "branch host and
RecipeExecution both own candidate submission" is **true at baseline**, and the effect is
worse than a redundant row.

### The trace

1. `RecipeExecution` opens the cell and branch and reads the brief (`execution.ts:244-246`).
2. It spawns the branch with **the principal's own profile** (`branch_execution.ts:206-209`) —
   the port never substitutes a branch-only profile.
3. The branch runs `apply()` → `launchDeployment(profile)` → the **full stack**, then registers
   the branch-restricted `palimpsest_reasoning` over the **same** SQLite path the harness holds
   (`index.js:67,74-135`).
4. The branch agent calls `palimpsest_reasoning action "candidate"` → `submitCandidate` writes
   `CANDIDATE_SUBMITTED` and returns `PENDING` (nothing evaluates it).
5. The branch exits, printing `PALIMPSEST_BRANCH_RESULT {status, statement, …}`.
6. `RecipeExecution` reads `output.statement` and calls `submitCandidate` **again**.

### What actually collapses the duplicate — and why that is not a design

The second submission has an identical payload in the non-evidence case, so its
`candidateDigest` **and its event id** are identical (`eventId = digest(type, cellId, payload)`,
`artifacts.ts:518-520`), and `SqliteReasoningCellStore.appendAtomic` is idempotent by event id
(`store.ts:208-215`). So the second write inserts nothing and returns the stored event;
`submitCandidate` re-derives state, finds no *admitted* claim, and returns `PENDING` again
(`service.ts:462-471` — dedup is keyed on `state.claims`, i.e. **admitted** claims only).
`RecipeExecution` then evaluates once and the claim is admitted.

So a single Explore works — **by two accidents**: the projection's event-id idempotency and
the fact that nothing admits the branch's candidate in between.

### Why it still must be fixed

- **Repeated Ask relies on `DEDUPLICATED` as a normal success path.** The cell id is derived
  from the plan digest, so a second identical Explore reuses the cell **and the branch ids**;
  the claim is already admitted, so *both* submissions return `DEDUPLICATED`,
  `if (submitted.status !== "PENDING") continue` skips evaluation, and `admittedClaimIds` is
  empty. The branch still reports `completed` (it only checks that the tool call happened,
  `runner.js:181-184`) and the user copy normalizes it as *"a candidate that converges on an
  existing claim is deduplicated, not lost"* (`result_view.ts:227-229`). The spec forbids
  exactly this: *"Do not rely on DEDUPLICATED as a normal success path caused by double
  submission."*
- **The evidence-grounded path silently splits provenance.** `RecipeExecution` never forwards
  `externalEvidenceRefs` (`execution.ts:263-268`) while the branch tool can
  (`index.js:122-126`). When the branch cites evidence, the two `candidateDigest`s differ, so
  the branch's candidate is **never evaluated** (an orphan `PENDING`) and the admitted claim
  **loses the citation**.
- **It contradicts the invariant the spec requires:** one branch execution → one structured
  result → `RecipeExecution` is the sole submit/evaluate owner.
- The branch holding a live `ReasoningCellService` is itself the §16 violation: a branch must
  not call candidate/evaluate/admit at all, and a prompt line is not a boundary (§17).

### The fix this stage must make

Make the packaged branch a **pure cognition/result adapter** (§16): the branch composes only
the frozen brief (plus an evidence allowlist when supplied) and registers **one host-private
strict tool** `palimpsest_branch_result` taking `{statement, evidenceRefs?}`; it composes no
deployment, no ReasoningCell, no principal tools. `RecipeExecution` remains the sole
submit/evaluate owner, and the evidence refs it submits come from the branch result, so the
citation is no longer lost. The regression must **fail on the pre-fix path**.

---

## 3. SPEC CORRECTIONS — the assumptions that do not hold

| # | Spec assumption | What the code says | What UX-C must do |
| --- | --- | --- | --- |
| **SC-1** | §7/§34 "decomposable + low coupling + high parallel benefit ⇒ EXPLORE" | `prefersExplore` also requires **verifiability HIGH** (`advisor.ts:311`) | dogfoods must use a task containing a verifiability marker; the copy explaining AUTO must not promise EXPLORE from three features |
| **SC-2** | §15/§56 "double ownership" | true, but the first run collapses via **event-id idempotency**, and `DEDUPLICATED` appears only on **repeat** runs | assert the sole-owner invariant **structurally** (the branch has no ReasoningCell at all), never by observing `DEDUPLICATED` |
| **SC-3** | §15 one-owner fix | the evidence path diverges: the recipe never forwards `externalEvidenceRefs` | the fix must also stop the branch submitting, and the recipe must submit the branch's cited refs (with the allowlist enforced) |
| **SC-4** | §9 reasoning store at `<project-data-dir>/reasoning.sqlite` | no such path, no profile field, and `install.ts` never closes a supplied store | add the derived path + ownership flag + close; caller-supplied stores stay caller-owned |
| **SC-5** | §10 "must not hard-code SUPPORTED" | the **shipped host bundle already does**: `host/dsh/lib/index.js:77-92` returns `standing: 'SUPPORTED'` with empty evidence and an all-zeros provenance digest | remove it; the packaged policy must be the INCONCLUSIVE one |
| **SC-6** | §17/§18 branch firewall | the branch registers the **full principal tool surface**; only prompt text and three wrappers restrain it | compose a minimal branch environment; a prompt is not a capability boundary |
| **SC-7** | §18 branch mode should not launch the full deployment | `launchDeployment` runs **before** the mode is known | dispatch the mode first; branch mode composes only the branch capability |
| **SC-8** | §22 wire the formatter | `src/advanced.ts` (the host entry) does **not** re-export `interaction` | export it (or host-local copy) so the host can call `crossProjectAttentionText` |
| **SC-9** | §23 "the runner supplies only `agents.get`" | more precisely it supplies a shim whose `get` ignores its argument and has no `resume`; the real resume-capable `agents` is already in scope | wiring change only |
| **SC-10** | §13 expects a typed `findingStanding`/`findingNote` | **no such field exists** | add it, and harden the verb and `didWhat` strings |
| **SC-11** | §6 "inbound pump / attention by default" | both are capabilities only; attention additionally needs `profile.attention` (+ marks) to be composed | do not describe attention as on-by-default; say what the host must set |
| **SC-12** | §20/§43 the host constructs the branch port | `reasoningCellStore` is manual plugin config, the branch port exists only in harness scripts, and the profile cannot carry reasoning options | add profile fields + host derivation, with at most ONE advanced override |
| **SC-13** | §21/§28/§29 keep `CF-UXA-01`, `CF-UXB-09`, `CF-UXB-04` open | confirmed by code (`MAX_BRANCH_HINT = 8`; `domainGate` unwired; resolver unwired) | close only the four permitted items |
| **SC-14** | §26 `activation:"none"` stays pull | already honoured (`launch.ts:255-256`; `pumpAndActivate` marks nothing) | preserve it; do not "helpfully" override |

No §57 STOP condition is triggered: a safe branch isolation is achievable by *not* composing
the principal stack, `RecipeExecution` can remain the sole owner, and no new scheduler or
store is needed.

---

## 4. Design decisions this audit fixes

1. **The packaged local-collaboration bundle is deployment-owned and derived**: a
   `SqliteReasoningCellStore` at a stable path beside the project's orchestration DB, created
   and closed by the deployment, with caller-supplied stores unchanged (SC-4).
2. **The packaged policies are explicitly exploratory**: verification returns
   `standing: "INCONCLUSIVE"` with empty evidence lists bound to the cell, candidate, frontier
   basis and the recipe's own policy ref; admission `ADMIT`s it **as a cell-local hypothesis**,
   and only for the first-party recipe Explore policy refs — never as a generic permissive
   policy, and never `SUPPORTED` without a real verification (SC-5).
3. **The branch is a pure result adapter** (SC-2/SC-3/SC-6/SC-7): minimal environment, one
   `palimpsest_branch_result` tool, no ReasoningCell, no principal surface, mode dispatched
   before any deployment composition.
4. **One lifecycle owner** for pump → drain → activate → mark-after-success; the DSH runner
   schedules the shared helper rather than re-implementing it, and supplies the resume-capable
   agents service plus the product formatter (SC-8/SC-9).
5. **Truthfulness is typed, not implied**: findings carry an explicit exploratory standing and
   a note that they are neither Evidence nor independently verified, and CHECK's copy stays
   about the project head (SC-10).
