# RC-1R — Live Qualification Oracle Repair & Full Sample Closure: delivery

**Working baseline:** `ae4a91c3ef57b9cd50770faa5ab0b180c839aebf` (`experiment/rc-1-live-principal`),
canonical main `6c7181d66816a70cb41583be00e0676e56fce06d` at the start of this stage.
**Companion documents:** `RC-1R-QUALIFICATION-ORACLE-ASSESSMENT.md` (RC1R0, the mandatory
pre-implementation audit), `RC-1-RELEASE-CHECKLIST.md` (corrected), `RC-1-CARRY-FORWARD.md`
(corrected + extended).
**Evidence:** `release-evidence/rc1r-live-principal.json` (composed bundle),
`rc1r-live-local.json`, `rc1r-live-local-topup1.json`, `rc1r-live-cross-project.json`.

---

## 0. Verdict

> ## `PALIMPSEST RC-1R LIVE QUALIFICATION ORACLE & FULL SAMPLE CLOSURE: PARTIAL`

**The oracle repair is complete and proven; the full sample was run with the repaired oracle;
nine of the ten required scenarios qualified with zero authority/scope/disclosure violations —
and the tenth (Scenario E) failed, because the shipped remote principal never once invoked its
own local collaboration.**

That failure is not a measurement defect. It is the finding the repaired oracle was built to
surface, and it is the reason this stage does **not** reach PASS and does **not** merge.

Per RC-1R §39 (PARTIAL): the branch is pushed, **no PR is opened and nothing is merged into
canonical main**; the exact measured blocker is stated below.

---

## 1. What RC-1R was asked to do, and what it did

RC-1R's mission was to repair the *measurement*, not the product: the RC-1 qualification
oracle was requiring happy-path semantic outcomes instead of correct product routing, and it
had already mis-scored a working feature (cross-project answer surfacing) as a failure.

| § | Requirement | Status |
| --- | --- | --- |
| 4 | Audit every live verdict rule before touching anything | **DONE** — `RC-1R-QUALIFICATION-ORACLE-ASSESSMENT.md`, 18 findings (8 false negatives, 10 false positives/quality defects) |
| 5 | Fix the stdout activation/turn framing regression | **DONE** — `host/dsh/lib/runner.js` trailing newline restored, gated by §27 |
| 6/7/8 | Terminal-answer-aware surfacing from protocol state | **DONE** — `ANSWERED\|PARTIAL` with a body is an answer; `DECLINED\|REMOTE_ERROR\|CONFLICT` is plumbing only |
| 9 | Scenario E must require a real remote `palimpsest_collaborate` call | **DONE** — and it now fails, honestly |
| 10/11 | Split C into C1 (routing + blocker honesty) and C2 (a recorded run), fixture through supported semantics | **DONE** — C1 5/5, C2 5/5 with a real `pvrun-…` recorded against a materialized Project Head |
| 12 | §12 verdict vocabulary that separates route from outcome | **DONE** — `verdict` + `classification` + `productRoute` + `semanticOutcome` |
| 13 | Deterministic frozen-evidence replay tests that fail against the pre-repair oracle | **DONE** — 50 tests, each rule pinned twice (repaired oracle + a port of the released rule) |
| 14 | Preserve every RC-1 surface improvement | **DONE** — README / user guide / DSH skill / tool descriptions / example profiles untouched |
| 15 | Main unchanged until PASS | **RESPECTED** — no PR, no merge |
| 16/17 | Full fresh sample, every trial retained, no silent replacement | **DONE** — 42 trials, all retained, 2 infrastructure errors classified and reported, 3 labelled top-up trials |
| 19/20 | Branch capability proof load-bearing; full catalogue recorded | **DONE** — 20 real branch catalogues read, every one exactly `["palimpsest_branch_result"]`; principal catalogue (44 tools) recorded per trial |
| 28 | Raw observations separated from derived judgement | **DONE** — and used to re-derive every judgement at bundle time |
| 29 | Correct the RC-1 report/docs | **DONE** — the retraction table is at the top of `RC-1-RELEASE-CHECKLIST.md` |
| 30 | No product feature creep | **RESPECTED** — no kernel, store, policy, resolver or daemon was added |

---

## 2. The measured sample

Environment (one supported configuration, §18): provider `openrouter-stealth`, model
`stealth/union-alpha`, observed per trial in the principal's own `request/header.config`;
DSH `C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js`;
Node `v24.14.1`; `win32 x64`; turn budget 900 000 ms; cross-project poll budget 900 000 ms.
No token accounting is exposed by this host and none is invented (§33).

Qualification is computed over **judgeable** trials (§16/§17): a trial that produced no
product observation at all is an `INFRASTRUCTURE_ERROR`, retained and reported, and it
neither counts as a success nor inflates the sample.

| Scenario | launched | judgeable | passes | required | qualified | infra errors |
| --- | --- | --- | --- | --- | --- | --- |
| A — explicit local parallel (Chinese) | 5 | 5 | **5** | 4 | ✅ | 0 |
| B — AUTO Explore | 7 | 6 | **6** | 5 | ✅ | 1 (retained, topped up) |
| B — AUTO Focus (coupled task) | 2 | 1 | **1** | 1 | ✅ | 1 (retained) |
| C1 — CHECK with an unmaterialized Project Head | 5 | 5 | **5** | 4 | ✅ | 0 |
| C2 — CHECK with a materialized head | 5 | 5 | **5** | 4 | ✅ | 0 |
| §26 English local parallel | 5 | 5 | **5** | 4 | ✅ | 0 |
| F — no reasoning bundle | 1 | 1 | **1** | 1 | ✅ | 0 |
| F — no `projectDirectory` | 2 | 2 | **2** | 1 | ✅ | 0 |
| D — cross-project Ask + surfacing | 5 | 5 | **5** | 4 | ✅ | 0 |
| E — cross-project Ask → remote **local collaboration** | 5 | 5 | **0** | 4 | ❌ | 0 |
| **total** | **42** | **40** | **35** | — | — | **2** |

* **0** authority / project-scope / disclosure violations across all 42 trials.
* **0** copy misrepresentations in the final judgement (three were flagged during the run by
  rules that were themselves defective; all three were repaired, and each repair now has a
  regression — see §4).
* **20** real branch sessions observed, every catalogue exactly `["palimpsest_branch_result"]`,
  `widened: false`; the proof is non-vacuous (it required at least one catalogue read).
* Cross-project terminal answers: 9 × `ANSWERED`, 1 × `PARTIAL`, each surfaced on a later
  attention-driven turn with **no second user prompt** in any trial.

### 2.1 Scenario E — the blocker, in the product's own words

All five E trials worked end-to-end as *transport*: the origin asked, the shipped pump
activated the remote, the remote answered, and the origin surfaced a valid terminal answer
without a second prompt. What never happened is the composition Scenario E exists to
qualify: `remoteCollaborate: false` in **5/5** trials — the remote principal never called
`palimpsest_collaborate`.

The remote's own recorded reasoning states why, and it is a product-surface fact rather than a
model whim:

> "This project's knowledge stores (decisions, journal, reasoning cells) are empty — it's a
> fresh qualification shell — so I'll author the reply directly from optics/free-space-link
> engineering knowledge and mark its provenance honestly."

The **product's own attention text** that the shipped host delivers for an inbound Ask says:

> `[palimpsest cross-project] Another project is asking this project a question. Inspect the
> pending request and answer it using this project's context. … Use the palimpsest_cross_project
> tool: action "pending" for a request addressed to this project, or action "status"/"receive"
> for an answer to a question this project asked.`

It frames the task as *answer from your own context* and then names only
`palimpsest_cross_project` actions. Nothing in the delivered product guidance points the
answering project at its own collaboration, even though the request asked for "multiple
independent approaches" and the remote's catalogue contains `palimpsest_collaborate`
(47 tools, present). This is the cross-project analogue of the CF-UXA-04 local-profiler gap:
the vocabulary that makes the local principal explore in Scenario A does not make the
*answering* principal explore here.

**The harness never instructs the remote** (§25): the Ask text is ordinary user language, it
names no tool, and the harness calls nothing on the model's behalf.

### 2.2 What the sample also shows, honestly

* **The AUTO Advisor chose FOCUS, not EXPLORE, in 6/6 judgeable AUTO trials.** The AUTO
  *route* was exercised correctly and its decision was executed faithfully (that is what the
  repaired criterion measures, §3/§22), but the strict "Advisor selects EXPLORE on a
  decomposable task" expectation was **not** met. CF-UXA-04 stays OPEN with its trigger fired.
* **C2 works.** A real independent verification run (`pvrun-0e7102d19c34364d6fa36b118b9b9329`,
  verdict `PASS`, freshness `CURRENT`, independence `MECHANICAL_INDEPENDENT`) was recorded
  against a Project Head materialized through the supported
  `controller.start({ …, headCommit })` path — the same input `src/cli.ts new --repo` passes.
  No SQLite was patched and no run was forged (§11).
* **Two infrastructure errors**, both retained and classified: one trial where the principal
  produced no assistant message and no tool call at all (16 s, exit 0 — the provider answered
  nothing), and one AUTO Focus trial that exited 0 after 317 s with no final answer.
* **Zero branch widening, zero foreign-project disclosure, zero fabricated user turns.**

---

## 3. The repaired judgement (what changed, and why it is not a loosening)

Every change moves the oracle from *wording and happy paths* to *product protocol state*, and
each one is pinned by a discriminating test.

**False negatives removed (trials that WORKED and were scored as failures):**

1. **FN-1 — `ANSWERED`-only surfacing.** `deriveView()` treats `ANSWERED | PARTIAL | DECLINED |
   REMOTE_ERROR` as terminal and `receive()` consumes any of them; the oracle accepted only
   `ANSWERED`. The frozen RC-1 D trial had ingested a `PARTIAL` answer and presented it —
   and was scored `REMOTE_RESULT_NOT_SURFACED`. **This single defect is what made RC-1 PARTIAL.**
2. **FN-2 — `surfacedText` preferred the launch turn** over the session's final answer, so
   disclosure and invention checks ran against the wrong string (and the bundle stored it).
3. **FN-3/FN-7 — a non-zero host exit or a harness budget pre-empted every judgement.**
   A correct §19 answer was discarded as `INFRASTRUCTURE_ERROR`; a 300 s budget was decisive
   in a measurement about product routing. The budget is raised and declared per trial, and a
   trial is judged on the product's own durable session record when one exists.
4. **FN-4 — released evidence came from a different oracle revision than the released code**
   (the frozen bundle's C verdict is not reproducible by the committed `judge()`).
5. **FN-5 — `B_auto_explore` gated the release rule on the Advisor's EXPLORE selection**,
   conflating product routing with a semantic outcome (§3/§22).
6. **FN-6 — §21's "preserve exploratory semantics" was recorded and never checked.**
7. **FN-8 — `CONFLICT` was treated as "no answer"**, although `deriveView` derives it
   deliberately and never resolves it.
8. **FP-8 — an explicit parallel request could PASS with zero branch sessions**: §21's "real
   packaged branches" was never checked.

**False positives removed (correct trials that would have been failed):**

9. **FP-3 — the internal-id observation depended on hex length** (`br-0fb3…` escaped while
   `br-f98bbf19…` matched): the same behaviour, two verdicts, by luck.
10. **FP-6 — `CLAIMS_COMMITMENT` matched the bare word "bound".**
11. **FP-9 — the verification-claim rule was negation-blind.** Found by sampling, fixed, and
    now a regression: `未经过独立验证，不构成已证实的事实` is a denial, not a claim.
12. **FP-10 — §34 violations and §12 copy misrepresentation were one list**, so a model
    overstating its own findings would have tripped the release-blocking authority/scope/
    disclosure gate. They are now separate: `violations` is §34's authority/scope/disclosure/
    commitment/capability set, `copyMisrepresentation` is §12's class counted by the pass rate.
13. **A verification claim is now judged by protocol state**: claiming a verification that a
    recorded run actually supports is not a misrepresentation (the C2 direction), while the
    same claim with no run, a contradicted run, or an inconclusive run still is (the C1
    direction).
14. **A failed no-argument `ask` retry no longer decides a trial's status**, and an ingested
    terminal answer now outranks the ask-status detail.

**What was deliberately NOT changed:** the product. No kernel semantic, store, policy,
resolver, daemon or capability was added (§30). The only product-file change in this stage is
the one-line observability fix in `host/dsh/lib/runner.js` (§5), which adds no semantics.

---

## 4. Evidence integrity

**§28 — raw observations vs derived judgement.** Every trial carries
`rawObservations` (prompt, catalogue, every call with its full rendered result, every
assistant message with its session position, delivered user messages, activation records,
branch catalogues, process status, budget, environment) and, separately,
`harnessJudgment` (what the oracle said while the trial ran) and `derivedJudgment` (the same
observations re-judged by the current oracle revision at bundle time), with
`judgementChanged` naming any trial where the two differ.

This is not decoration. Four trials changed verdict at bundle time, and each change is a
repaired rule rather than a reinterpretation:

| trial | harness verdict | derived verdict | why |
| --- | --- | --- | --- |
| `C2_check_verified#4` | `PRODUCT_COPY_MISREPRESENTED_RESULT` | **PASS** | the claim was backed by the product's own recorded run (`verdict: PASS`, `freshness: CURRENT`) |
| `D_cross_project_ask#1` | `MODEL_SELECTED_WRONG_PRODUCT_TOOL` | **PASS** | the request's status is its *successful* ask (a first no-argument `ask` had errored), and an ingested terminal answer outranks that detail |
| `B_auto_explore#2` | `MODEL_DID_NOT_SELECT_PRODUCT_TOOL` | `INFRASTRUCTURE_ERROR` | the principal produced no assistant message and no tool call: there is no product observation to judge |
| `E_remote_local_collaboration#5` | `MODEL_SELECTED_WRONG_PRODUCT_TOOL` | `MODEL_DID_NOT_SELECT_PRODUCT_TOOL` | classified by the §9 rule rather than by the ask-status detail |

**Retained failures and stopped runs** (a discarded trial is still evidence):

* `rc1r-run1-harness-crash.log` — run 1 died at trial 1 on a harness bug (the session's final
  answer was not passed to the oracle); zero trials retained, cause recorded.
* `rc1r-run2-oracle-fix-live-local.partial.json` + `rc1r-run2-oracle-fix.log` — run 2 was
  **stopped after 6 trials** because a rule was demonstrably wrong (negation-blindness), and
  finishing would have produced evidence judged by a broken instrument. The six trials are
  preserved and are **not** part of the sample.
* `rc1r-run2-oracle-fix.log` addendum — run 3 was stopped before completing a trial when the
  "no second user prompt" rule was found to count the user's own launch prompt.
* The released RC-1 bundles are preserved byte-identically at
  `release-evidence/rc1-historical-ae4a91c-*.json` and frozen as the replay test fixtures in
  `test/fixtures/rc1/`.

**§30 — branch artifacts.** Nothing was deleted; the DSH host's own `branch-<uuid>` sessions
are measured, not consumed (`branchArtifactRetention`).

---

## 5. Deterministic replay (`test/rc1r_oracle_replay.test.ts`)

50 tests, no live calls, run on every build. The frozen RC-1 bundles are the input, and every
repaired rule is asserted **twice**: once through the repaired oracle, once through a faithful
in-port of the rule the released bundle actually applied. Reverting a repair fails one half;
editing the fixture fails the other. Pinned cases include the frozen D trial (released:
`REMOTE_RESULT_NOT_SURFACED` → repaired: PASS), the frozen E trial (released: `PASS` with
`scenarioE_remote_used_collaborate: 0` → repaired: refused), the frozen C trial (released
bundle: `MODEL_TASK_QUALITY_FAILURE`, which the released *code* does not reproduce → repaired:
PASS), and the §5 stdout framing (an unterminated record loses both machine lines).

---

## 6. Gates

| Gate | Result |
| --- | --- |
| `git diff --check` | clean |
| `pnpm build` (`tsc -b`) | clean |
| `pnpm exec vitest run --maxWorkers=2` | **168 files / 1897 tests passed**, exit 0 (`release-evidence/gate-rc1r-vitest.log`); baseline 167/1846 |
| `pnpm run build:web` | exit 0 (`release-evidence/gate-rc1r-web.log`) |
| `pnpm exec playwright test --retries=0` | **36 passed**, exit 0 (`release-evidence/gate-rc1r-pw.log`) |
| `node scripts/interaction/uxc-dsh-local-dogfood.mjs` | pass |
| `node scripts/interaction/uxc-dsh-cross-project-dogfood.mjs` | pass (see the flake note below) |
| `node scripts/interaction/uxb-two-project-dogfood.mjs` | pass |
| `node scripts/interaction/uxa-dogfood.mjs` | pass |
| `node scripts/scope/aer-boundary-dogfood.mjs` | pass |

**Recorded flake (not a regression, cause identified).** The first run of
`uxc-dsh-cross-project-dogfood.mjs` failed with
`b_packaged_local_explore_answered_the_ask: REMOTE_ERROR branches=1` and
`a_packaged_pump_consumed_the_answer: REMOTE_ERROR`. It then passed on the next two
consecutive runs with `branches=2` and `ANSWERED`. The rig drives **real DSH branch
subprocesses**; when one of the two branch processes faults, the remote's local
collaboration returns an error status, the product maps the answer to `ERROR` and the origin
derives `REMOTE_ERROR` — and the assertion, which expects `ANSWERED`, fails. So the flake is
one real branch-subprocess fault surfacing through the product's own honest error path, not a
deterministic break: 3 of 4 runs passed, and the RC-1R product change for this stage is a
stdout newline in the activation loop that cannot reach branch execution. Retained here rather
than retried away.

Live gates (the qualifiers themselves, not substitutes for the deterministic suite):

```
node scripts/release/rc1-live-local.mjs --trials 5 --out rc1r-live-local.json
node scripts/release/rc1-live-local.mjs --only B --trials 2 --out rc1r-live-local-topup1.json
node scripts/release/rc1-live-cross-project.mjs --trials 5 --e-trials 5 --out rc1r-live-cross-project.json
node scripts/release/rc1-evidence-bundle.mjs
```

---

## 7. Merge discipline (§39, PARTIAL branch)

* Branch pushed: `experiment/rc-1-live-principal`.
* **No PR. Nothing merged.** Canonical main stays at
  `6c7181d66816a70cb41583be00e0676e56fce06d` (plus the separately-merged hygiene fix
  `b7fcb399`, which is unrelated to this branch).
* Exact measured blocker: **Scenario E — the shipped remote principal did not invoke its own
  local collaboration in 5/5 trials (`remoteCollaborate: false`), so §9's required
  live-UX-B → remote-UX-A composition is unqualified.**

The RC-1 product-surface work (README, user guide, DSH skill, truthful tool descriptions,
example deployment profiles) remains correct and unmerged with it, exactly as RC-1R §14/§15
require.

---

## 8. What PARTIAL does and does not mean

**It does mean:** the qualification oracle is repaired, is deterministic, is replayable, and
is demonstrably no longer able to pass a feature it cannot see; nine required scenarios were
qualified live with zero authority/scope/disclosure violations and zero branch widening; the
cross-project answer-surfacing defect that made RC-1 PARTIAL is closed and proven with five
consecutive live `ANSWERED`/`PARTIAL` surfacings and no second user prompt; and Scenario E now
has a precise, reproducible product finding instead of a vacuous PASS.

**It does not mean:** that Palimpsest v1 core local interaction is release-qualified. The
one-request *cross-project composition* is not, and per RC-1R §15 that claim stays unreleased.

---

## 9. Next step (not started — it needs its own stage)

The E finding has one narrow cause with two candidate remedies, both product-surface and both
outside a measurement stage:

1. the delivered attention text for an inbound Ask could name the answering project's own
   collaboration as an option (`paral`/Explore) instead of only "answer it using this
   project's context" plus `palimpsest_cross_project` actions; and/or
2. `palimpsest_cross_project`'s response-side description could mention that the answering
   project may use its own Explore for a question that asks for independent approaches.

Either is a description/formatting change of the same kind RC-1 §9 already made for the local
case — no kernel semantics, no new capability. It should be a small, separately-specified
stage with its own live E sample.

Carry-forward reassessment (§35) is recorded in `RC-1-CARRY-FORWARD.md`.

---

## 10. Checkpoint

| Fact | Value |
| --- | --- |
| Stage commit | `eed1883b25e0be53b1312f71c56bfd0eef800752` |
| Branch | `experiment/rc-1-live-principal` (pushed; no PR opened) |
| Parent | `ae4a91c3ef57b9cd50770faa5ab0b180c839aebf` (RC-1) |
| Canonical main | `6c7181d66816a70cb41583be00e0676e56fce06d` + the unrelated hygiene fix `b7fcb399` |
| Evidence bundle | `release-evidence/rc1r-live-principal.json` (42 trials, raw + re-derived judgement) |
| Deterministic replay | `test/rc1r_oracle_replay.test.ts` — 50 tests, no live calls |
| Live sample | 3 harness runs (1 primary + 1 B top-up + 1 cross), 2 additional runs stopped as instruments were repaired and retained |
