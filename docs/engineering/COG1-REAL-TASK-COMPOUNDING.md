# COG-1 — Real-Task Cognitive Compounding & Adaptive Multi-Agent Synthesis

**Stage:** COG-1
**Branch:** `palimpsest-cog1-real-task-compounding`
**Baseline:** `61b0757dea988daa10a00c220dee34e2d4c72028` (CI3 Evidence Freeze; a strict descendant of `origin/main` `044330b`, 0 commits behind)
**Code Freeze:** `f12521903d5e07d850406d7c6dab6db20243df94` (tree `b9b5f1c0bec2606ce78ca711d8df205be5db5f96`)
**Runtime:** `0.2.1-rc.3` · **Model:** `deepseek-official` / `deepseek-flash` · **Node:** v24.22.0
**Evidence manifest:** `research-evidence/cog1/cog1-evidence.json`
**Audit:** `docs/engineering/COG1-CAPABILITY-AND-PRODUCT-PATH-AUDIT.md` · **Protocol:** `docs/engineering/COG1-EXPERIMENTAL-PROTOCOL.md`

---

## 1. Executive conclusion

**The decisive question was answered with a bounded negative result, and one real defect it exposed was fixed and verified.**

Six real model-driven runs — three architectures × two connected rounds — produced complete, internally consistent, source-grounded quarterly plans on a non-software task. Every condition resolved every synthesis trap the scenario was built around. But **no run used a single one of the product's cognitive tools**, even though the Palimpsest condition had 26 of them in its request header. The plans were produced with file tools, and what crossed from Round 1 to Round 2 was file capital in all three conditions.

The diagnostic that followed found why the product could not have helped even if it had been chosen: its project journal **accepted a write against a project that every read refused**, and **no tool returned an entry body**. The product could record durable project knowledge and could not read it back.

That is now corrected in two files and verified in three ways: a RED/GREEN test, a cold process boundary that recovered an unguessable marker from the journal and nowhere else, and a held-out probe in a different non-software domain with a different project id.

**What this stage establishes:**
- Palimpsest's principal is genuinely reachable and callable by a real model in an isolated runtime home.
- On an ordinary document task, a real model **does not choose** it.
- The minimum knowledge loop that would make compounding possible was broken, is now closed, and works across a process boundary.

**What this stage does not establish:** that Palimpsest produces better cognitive outcomes than a strong single agent on this task. No condition used it, so no product-attributable advantage exists in this data. That is the honest boundary.

---

## 2. Git and environment baseline

| item | value |
|---|---|
| Local HEAD at start | `61b0757dea988daa10a00c220dee34e2d4c72028` (tree `3dcfc40`) |
| Branch created | `palimpsest-cog1-real-task-compounding` |
| `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b` — **an ancestor** of HEAD (0 commits behind, 346 ahead) |
| Local `main` | `67b29c9` — behind `origin/main`, not the working line; not touched |
| Working tree | clean at baseline and at the freeze |
| E-LIVE | `ec40f6b` present, an ancestor of both `origin/main` and HEAD |
| Runtime | `@deepseek-ai/dsh@0.2.1-rc.3` installed globally and revalidated |
| Model access | `deepseek-flash` via the owner's configured `deepseek-official` route, verified with a live one-word call (exit 0, 9 s) |
| Protected assets | 68 evidence trees, 95 worktrees, 19 gate roots — all unchanged; the real runtime home was not written |

**Environment note, recorded rather than hidden.** At the start of this stage the repository's top-level `node_modules` links were missing (only the pnpm virtual store remained), so nothing could build. The links were restored with `pnpm install --frozen-lockfile` against the existing store and the committed lockfile. No dependency version changed and no network artifact was substituted: the install reported `reused 128, downloaded 0`.

---

## 3. Earlier-work comparison

| stage | what it established | how COG-1 differs |
|---|---|---|
| **E-LIVE** | long-horizon compounding across generations, but with a **domain-specific structured interpreter** and deterministic workers | COG-1 is real-model, open-ended, non-software, and deliberately does **not** reuse the DAG-planner interpreter |
| **CI1–CI3** | two-Owner causal integration; delegated completion qualification; evidence identity and revision-scoped authority | CI3 is about the **qualification machinery**. COG-1 is about **whether earlier cognitive work becomes usable capital**, with a non-authoritative document task |
| **CI4 (proposed)** | contract-bound evidence and Gate applicability | **not expanded here.** COG-1's pilot never promoted a candidate; the CI4 gap remains a carried-forward, separately-owned limitation |
| **R1 / R1-L** | knowledge *reachability* from a worker process, measured with nonces | COG-1 measures **use and inheritance by a principal on an ordinary task**, not the delivery mechanics of one context field |

---

## 4. Actual product architecture as observed

Verified live, not inferred:

| capability | state in the C condition |
|---|---|
| Principal composition | `application: "full"`; `palimpsest-dsh-host` bundle over a typed deployment profile |
| `palimpsest_*` tools | **26**, all present in the model request header |
| Local exploration | `AVAILABLE`, branch adapter `dsh-subprocess-branch:cog1-c`, reasoning store `CONFIGURED` |
| Project verification | `AVAILABLE` |
| Attention / cold resume | `PULL` / `UNAVAILABLE` in this composition |
| Project workspace stores | composed (`projectJournal`, `projectAssociations`) |

Not reachable by a model, confirmed at source and by probe: Project Intent (no tool), Proof and Procedure surfaces (no profile field), asset association (HTTP only), knowledge selection (host argument only), Trajectory projection (worker-prompt only), promotion (operator-only). The audit records each at the rung it was observed.

---

## 5. Experimental protocol

Pre-registered before any trial (`COG1-EXPERIMENTAL-PROTOCOL.md`), and unchanged afterwards.

- **Scenario:** Riverside/Riversdale Community Arts Centre (fictional), a quarterly service-improvement plan under a fixed £48,000 envelope. Eight synthetic source files, each labelled synthetic.
- **Synthesis traps:** a 92% satisfaction figure from a self-selected Family Saturday sample; Youth Studio visits down while unique participants rose (supply, not demand); the 2023 evening gain that vanished with the minibus; a 2022 poster campaign with a null result; a capital lead time; an envelope that cannot fund everything.
- **Conditions:** A strong single agent (subagent tools disabled), B lead + workers (subagent/workflow enabled), C the shipped Palimpsest principal.
- **Fairness:** same model, same pack, byte-identical task text, same working-directory shape, 25-minute cap per run, same eight deliverables.
- **Rounds:** Round 2 is a **new process and new session** for every condition, over the same working directory; the update pack is released identically.
- **Update pack:** U1 estates survey (new observation), U2 lift re-quote + new licensing condition (changed constraint), U3 partner clarification (changed interpretation), **U4 café notice (negative control)**.
- **Budget:** six model-bearing runs; no retry for a poor answer; no intervention during a run.
- **Oracle:** its own transcription of the quoted costs and ground truth, committed outside every working directory. Isolation limitation stated in advance: the participant has a shell, so this is not a sandboxed blind evaluation.

---

## 6. Real model behaviour

All six runs completed with exit 0 and no timeout.

| run | wall clock | model turns | input tok | output tok | tool calls | `palimpsest_*` calls |
|---|---|---|---|---|---|---|
| A·R1 | 721 s | 71 | 62,328 | 116,901 | 95 | **0** |
| A·R2 | 840 s | 107 | 108,760 | 132,299 | 118 | **0** |
| B·R1 | 737 s | 75 | 64,679 | 113,195 | 87 | **0** |
| B·R2 | 753 s | 115 | 127,022 | 114,652 | 131 | **0** |
| C·R1 | 444 s | 47 | 27,401 | 61,663 | 60 | **0** |
| C·R2 | 900 s | 119 | 105,946 | 144,260 | 171 | **0** |

**The central observation.** Condition C's request header contained all 26 `palimpsest_*` tool definitions. The model read the source pack with `bash`/`read`, reasoned in its message text, and wrote the deliverables with `write`/`edit`. It never attempted a product tool — not even the one that would have been natural (`palimpsest_project`). Condition B was offered `subagent`, `subagent_fork`, `subagent-control` and `workflow`; it used none. **Neither architecture's distinguishing capability was exercised.**

That is the honest measurement, and it is not a harness failure: a later diagnostic drove the same profile with an explicit instruction and the tools executed.

---

## 7. Two-round cognitive history

Each condition was handed an empty Round-2 context and only the working directory.

**What changed.** Every condition read the update pack and revised the plan. The sharpest change is common to all three: U2 makes the round-1 "lift + evening + bus" plan cost £51,500, £3,500 over the envelope, and adds a licensing condition on evening events over 60 attendees. Each condition found this independently and each resolved it the same family of ways — the lift deferred or dropped, and a hard 60-attendee cap introduced.

**What was inherited.** All three conditions consulted their own Round-1 files in Round 2, and the counts are not subtle: A referenced its deliverables 118 times, C 95, B 33. No condition re-derived the Youth Studio supply reading or the transport finding from the raw pack; they carried them forward and spent Round 2 on the new material.

**What was repeated.** Condition A re-read the source pack nine times and its deliverables 118 times — the most evidence re-reading of the three. B was the most economical on inherited material (33 deliverable references, 8 source references). None of this is a defect; it is the cost of file-based inheritance with no index.

**What the product contributed: nothing.** Its durable stores were never written. The zeroes are the finding.

**Concrete differences in adaptation:**
- **A** imposed a zero-tolerance compliance metric on the 60-cap and rewrote its fallback option set.
- **B** deferred the lift to a separate capital bid and rewrote all eight artifacts to one £37,500 plan.
- **C** doubled the Youth Studio block at the same £6,500 (U3 says the same money now buys twice the sessions), added a turnaway log so cap-constrained demand is still measured, renamed its uncertainty ids to avoid colliding with the update ids, and revised its cost-per-visit ratios.

---

## 8. Synthesis analysis

The scenario was designed so that no single document settles the plan. All three conditions resolved every trap:

| trap | resolution observed |
|---|---|
| 92% satisfaction | all three: a self-selected Family Saturday sample, not a venue-wide finding |
| Youth Studio decline | all three: supply (4→2 sessions), unique participants rising, interest not falling |
| 2023 evening pilot | all three: transport is the active ingredient; do not fund evening opening without it |
| 2022 poster campaign | all three: no measurable effect; do not repeat without a specific audience and offer |
| lift sequencing | all three: capital, lead time, first-floor restriction respected |
| envelope | all three: total ≤ £48,000, every line a quoted cost |
| U4 café notice | all three: explicitly no change to the programme plan |

**Where genuine synthesis occurred** (a source-grounded change to the plan, not a mention):
- The estates survey **contradicted** the board's 2022 minute ("awareness exists"). All three qualified the old conclusion rather than choosing a side, and all three refused to convert that into a repeat of the borough-wide print spend.
- U3 **reversed** a reading the Round-1 pack itself contained (the youth worker's "young people moved on"). C responded by doubling the block for the same money and revising its cost-effectiveness; A and B likewise funded more sessions.
- The 60-cap is a **derived constraint**: it comes from combining U2's threshold with the fact that the lift is unfunded. All three derived it; it is in no document.

**Where the synthesis was weak:** the rubric saturated at 11/11 and 7/7 for all three, so it did not discriminate. The differences that exist are stylistic and in emphasis, not in conclusions. A lexical rubric cannot separate "understood the trap" from "used the right words", which is why every artifact was read.

**No unsupported synthesis was found** in the final artifacts: no condition asserted a claim the pack contradicts, and the three that quantified cost-effectiveness showed their arithmetic.

---

## 9. Comparison results

| | A (single) | B (lead+workers) | C (Palimpsest) |
|---|---|---|---|
| Deliverables | 8/8 | 8/8 | 8/8 |
| Mechanical budget/consistency | pass | pass | pass |
| Round-1 rubric | 11/11 | 11/11 | 11/11 |
| Round-2 rubric | 7/7 | 7/7 | 7/7 |
| Bonus claimed | £37,500 | £46,000 → £37,500 | £37,500 |
| Product tools used | 0 | 0 | **0 of 26** |
| Subagents used | n/a (disabled) | **0** of 4 available | 0 (delegate offered) |
| Total wall clock (2 rounds) | 1,561 s | 1,490 s | 1,344 s |
| Model turns | 178 | 190 | 166 |
| Tool calls | 213 | 218 | 231 |
| Human interventions | 0 | 0 | 0 |

**The comparison is a tie on output quality and a null result on product advantage.** C was somewhat faster in Round 1 and slower in Round 2, which is noise at n=1. No cost saving, no quality gain, and no observable product-attributable behaviour distinguishes C.

**One honest nuance:** B's Round-1 plan (£46,000, including the £22,000 lift) was the most ambitious and the only one that funded the access fix; it became unaffordable in Round 2. A and C both planned £37,500 from the start. Whether B's ambition is better judgement is not decidable from one run.

---

## 10. Human meta-coordination ledger

The experiment-controller did, and the participants did not:

1. **Setup (routine, legitimate):** prepared the worlds, profiles, isolated runtime homes and the identical task text.
2. **Data release (pre-registered):** released the update pack between rounds, identically.
3. **No semantic assistance:** no decomposition, no priority order, no hint, no reminder of prior conclusions, no manual forwarding of a finding between agents.
4. **One expert diagnostic after the pilot** (`diagnose_tools.mjs`), explicitly labelled and never counted as participant behaviour.
5. **One correction** (`e7ddec0`) and its verification.
6. **No intervention during any run.**

**Classification:** the pilot result is an **unassisted** run of each condition. The product conclusion is **expert-assisted** in the narrow sense that the stage's own engineer drove the product to find why nobody else would.

---

## 11. Bottleneck and correction

**The single most consequential failure.** Two facts, measured, and they compound:

1. **No condition used the product** (0 of 26 tools, 6 of 6 runs). Capability existed; selection did not.
2. **The product could not have helped if it had been used.** The diagnostic found:
   - `palimpsest_project journal` **accepted** a write for a project with no ProjectIR, while `overview`, `status` and `manage` all **refused** the same project. Durable project knowledge was recorded into a project the product cannot load, and a later ProjectIR under the same id would silently adopt it.
   - A second identical write was accepted again with a new `entryId` and digest.
   - **No tool returned an entry body.** `view()` omits the journal; `history()` returns titles; the application surface and the HTTP route already served bodies; the DSH adapter exposed only the write.

So the compounding chain — earlier work → retained asset → discovery → delivery → later use — was broken at its first and second links, even for a model that tried.

**Path:** `src/project_workspace/service.ts` (the scoped write methods) and `src/adapters/dsh/project.ts` (the model-facing action list).

**Correction, deliberately two small parts of one boundary:**
1. a project-scoped write requires the project its reads require (`requireProjectExists()` reusing `readProject()`, the reads' own predicate);
2. `palimpsest_project action=journal_entries` exposes the existing application read, so a later model can discover what an earlier one recorded.

**What was not done:** no new store, owner, schema, event type, registry, outbox or arbitration. No authority moved. No prompt was changed.

**RED → GREEN:** `test/cog1_workspace_write_fence.test.ts`. RED: the journal write and the asset association both resolved for a project with no ProjectIR. GREEN: both reject with `kind: unknown_project`; a valid write after `palimpsest_start` still succeeds; the tool returns the recorded body.

**Behavioural verification, across a real boundary:** `correction_retest.mjs` ran three separate principal processes over one deployment. Session 1 started the project and recorded a journal entry containing an unguessable marker. A **cold second process** called `palimpsest_project` and quoted the body back. The marker appears in no file on disk and in exactly one durable journal row.

**What the correction does and does not fix.** It makes the journal a truthful, project-scoped, readable knowledge loop. It does **not** make a model choose the product; that is a discoverability and task-fit problem this stage measured but did not solve. It also does not add idempotency to the journal: a repeated identical write still creates a second entry, which the stage records as a residual question rather than silently declaring fixed.

---

## 12. Regression and asset integrity

| check | result |
|---|---|
| `tsc -b` | exit 0 |
| `architecture:check` | PASS, 0 violations, 9 accepted baseline exceptions |
| `--check-public-api` | PASS, 0 missing / 0 changed / 0 added |
| CI1 + CI2 + CI3 + COG-1 suites | **20 files, 71 tests, 71 passed** |
| Affected suites (workspace, AER scope, adversarial, trajectory-t0, e2i, host runtime, change radius) | all passed |
| All 47 `lean_*` suites in isolation | 504/504 passed |
| **Authorized broad non-gate run** | **NOT GREEN** — 4 files / 6 tests failed, all `Test timed out in 30000ms`, 3766/3772 passed, exit non-zero |
| One bounded diagnostic rerun with a JSON reporter | 3772/3772 passed, exit 0 — **recorded as a diagnostic, not promoted into the authoritative result** |
| Protected assets | 68 evidence trees, 95 worktrees, 19 gate roots, runtime `0.2.1-rc.3` — unchanged |
| Real runtime home | not modified; all experiment state under test-owned directories |

The first broad run is reported as it happened. Its failures were resource-contention timeouts under a 24-worker run, not assertion failures; the two named files and the whole `lean_*` family pass in isolation, and the failure set moved between attempts the same way CI3 recorded. Rather than rerun until green, the sequence — failure, diagnosis, isolated confirmation, one attributed rerun — is recorded in full.

**CI4 status.** Unchanged and not weakened. The pilot never promoted a candidate; no experiment depended on qualification under changing standards; the carried-forward Contract Basis gap remains a separately-owned limitation.

---

## 13. Generalization assessment

**Supported by the data:**
- A real model-driven principal composed with the shipped product can act on a project in an isolated runtime home.
- All three architectures produce competent, evidence-grounded, adaptive plans on this task.
- On this task, a real model does **not** choose the product's cognitive tools, even with 26 of them available.
- The product's journal was write-only and unfenced, and after a two-part correction it is neither: a cold process can recover knowledge through it, in a second domain.
- The correction adds no authority and changes no valid call.

**Not supported:**
- That Palimpsest improves cognitive outcomes versus a strong single agent (nothing used it).
- That adaptive organization emerges (B's subagents went unused).
- That capital compounds across rounds **through the product** (all inheritance was file-based).
- Any statistical claim: one run per condition, stochastic model, no seeds.
- Any claim that a nonce recovered in a two-session probe generalizes to a long-horizon project.

**A finding worth carrying forward.** Agent-availability is not agent-use. B was offered a delegation capability and did the work itself; C was offered a knowledge substrate and wrote files instead. Any future stage that claims multi-agent value must show the cross-agent edge in the artifact, not the tool's presence in the schema.

---

## 14. Architectural recommendation

**The next stage should be about task-fit and discoverability of the cognitive surface, not about adding more capability.** The measured facts point one way: the product's surface is reachable, its minimum knowledge loop now works, and a real model still does not choose it for an ordinary document task. Adding branching, registries or orchestration would not change that.

The minimum next experiment, in order of what the evidence supports:

1. **Make the product's first move legible.** A deployment currently offers 26 tools whose names describe governance (`start`, `plan`, `gate`, `claim`) to a model whose task is "produce these documents". Measure whether a task-shaped entry point — for example a project-level invitation that states what the journal and the workspace are for — changes selection, without adding semantics.
2. **Then, and only then, test knowledge selection.** The selection path is host-only today. Do not build retrieval until a model has a reason to ask for it.
3. **Leave CI4 exactly where it is.** It remains a bounded, separately-owned integrity track; this stage neither needed nor touched qualification.

**Not recommended on this evidence:** a multi-agent framework, a new orchestration service, a knowledge store, a global evaluation registry, or a prompt that tells the model to use Palimpsest. Each would be a solution to a problem this stage did not observe.

---

## Verdicts

| | verdict |
|---|---|
| **V0 Baseline Integrity** | **ESTABLISHED** |
| **V1 Real Model Product Execution** | **ESTABLISHED** — reachable and callable; the model chose not to use it |
| **V2 Cognitive Production** | **ESTABLISHED** |
| **V3 Adaptive Collaboration** | **NOT ESTABLISHED** — no collaboration capability was used; no cross-agent influence exists |
| **V4 Intellectual Compounding** | **NOT ESTABLISHED** — no product capital was created or delivered; inheritance was file-based |
| **V5 Reality-to-Intent Adaptation** | **PARTIAL** — adaptation happened in every condition; the product's Intent path has no model surface |
| **V6 Cross-Artifact Synthesis** | **ESTABLISHED** for the artifacts |
| **V7 Human and Compute Efficiency** | **MEASURED** — no human intervention; Palimpsest was not cheaper |
| **V8 Transfer** | **PARTIAL** — the correction transferred mechanically to a second domain; no second cognitive comparison |
| **V9 Engineering Integrity** | **ESTABLISHED** — including the honest reporting of a non-green broad run |

**Overall research verdict.** Mechanically established: the principal is real, the correction is real, and the loop closes across a process boundary. Observed cognitive behaviour: all three architectures can do this task well. Evidence of comparative improvement: **none**. Unsupported generalization: none claimed. Blocked or unavailable functionality: the product's cognitive surface was available and unused; its Intent and selection paths remain unreachable by a model.

```
COG-1: NEGATIVE-TO-PARTIAL

MODEL-DRIVEN PLAN QUALITY:                                    EQUIVALENT ACROSS ARCHITECTURES
PRODUCT CAPITAL USED BY A REAL MODEL:                         NONE OBSERVED
PRODUCT KNOWLEDGE LOOP (WRITE-FENCED + MODEL-READABLE):       CORRECTED AND VERIFIED
COLD-PROCESS RECOVERY THROUGH THE PRODUCT:                    DEMONSTRATED
HELD-OUT DOMAIN TRANSFER OF THE CORRECTION:                   DEMONSTRATED (MECHANISM ONLY)
COMPARATIVE ADVANTAGE OVER A STRONG SINGLE AGENT:             NOT ESTABLISHED
```

*One correction is small; the honest finding it protects is not. The product could not preserve what it could not return, and no agent was going to trust a memory it could not read.*
