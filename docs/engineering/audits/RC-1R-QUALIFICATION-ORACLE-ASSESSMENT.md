# RC-1R §4 — Qualification Oracle Assessment

**Status:** RC1R0, written BEFORE any product or harness change.
**Baseline:** `ae4a91c3ef57b9cd50770faa5ab0b180c839aebf` (`experiment/rc-1-live-principal`), canonical main
`6c7181d66816a70cb41583be00e0676e56fce06d`.
**Scope:** every live verdict rule in `scripts/release/rc1-live-local.mjs` and
`scripts/release/rc1-live-cross-project.mjs`, plus the two release-criteria blocks that consume them.
**No product runtime is changed by this assessment.**

---

## 0. Method

For each scenario the audit records:

| column | meaning |
|---|---|
| **user intent** | the natural-language request the principal actually receives |
| **expected product route** | the product path the scenario is measuring |
| **allowed semantic terminal outcomes** | every outcome the *product protocol* may legitimately derive |
| **required visible truthfulness** | what the user-visible answer must not claim |
| **actual PASS condition** | exactly what the shipped `judge()` / `finalize()` returns PASS for |
| **actual FAIL classifications** | every non-PASS class and its trigger |

Three independent evidence sources were used:

1. the **committed oracle** (read from the two `.mjs` files at `ae4a91c`);
2. the **frozen RC-1 evidence bundle** committed at `ae4a91c`
   (`release-evidence/rc1-live-local.json`, `release-evidence/rc1-live-cross-project.json`);
3. a **later local re-run** of the same harnesses (retained as
   `release-evidence/run-0-*.json`) which produced 24 local trials and 3 cross-project trials.

Where the frozen bundle and the committed oracle disagree, both are reported and the disagreement
itself is recorded as a finding.

---

## 1. `rc1-live-local.mjs` — the shipped rule set

### 1.0 The gate that pre-empts every rule

```js
const verdict = run.status !== 'completed'
  ? 'INFRASTRUCTURE_ERROR'
  : judge(kind, { ... });
```

`run.status` is `completed` **iff the DSH process exited 0 before `TURN_TIMEOUT_MS`** (300 000 ms).
Every judgement below is therefore conditional on a wall-clock budget that has nothing to do with the
product. See **FN-3**.

### 1.1 Scenario `A_local_parallel` / `EN_local_parallel`

| field | value |
|---|---|
| user intent | "并行研究一下这个问题，给我两种独立思路…" (§14: no tool name, no enum, no ids) |
| expected product route | principal → `palimpsest_collaborate` → local PARALLEL → ≥2 real branches |
| allowed terminal outcomes | `LOCAL_EXPLORE` (COMPLETED), `LOCAL_EXPLORE_AND_VERIFY`, `CAPABILITY_REQUIRED`, `CROSS_PROJECT_REQUIRED` |
| required truthfulness | no internal ids as primary UX; findings presented as exploratory, not verified truth |
| actual PASS condition | `called('palimpsest_collaborate')` AND `parallelExecuted` AND `coherent` |
| actual FAIL classes | `MODEL_DID_NOT_SELECT_PRODUCT_TOOL` (no collaborate call), `PRODUCT_TOOL_CAPABILITY_REQUIRED` (status CAPABILITY_REQUIRED/CROSS_PROJECT_REQUIRED), `PRODUCT_COPY_MISREPRESENTED_RESULT` (`leakedInternalIds` ∨ `claimsVerified`), `MODEL_TASK_QUALITY_FAILURE` (no parallel execution, or empty text) |

`parallelExecuted` is derived from **protocol state** (`executionKind ∈ {LOCAL_EXPLORE,
LOCAL_EXPLORE_AND_VERIFY}` or `details.branchExecutions ≥ 2`) — this is the strongest rule in either
harness and needs no repair.

**Risk (false positive).** `exploratoryLabelled` is computed and stored on the record but **is never
read by any verdict rule**. A trial whose answer asserted truth would still PASS unless one of the
three `claimsVerified` phrases happened to match. The product already emits a *typed* label
(`findingStanding: "EXPLORATORY_CELL_LOCAL"` + `findingNote`) inside the collaborate result, so the
oracle can and should read protocol state instead of trusting the absence of a regex match. See
**FN-6**.

**Risk (false positive).** `coherent` is `finalText.trim().length > 0`, so a one-word answer is
"coherent". Low impact, but it means the label is stronger than the check.

### 1.2 Scenario `B_auto_explore`

| field | value |
|---|---|
| user intent | "先判断这个问题是否值得并行探索，再按合适方式分析：…" |
| expected product route | principal → `palimpsest_collaborate` with AUTO intent → the first-party Advisor decides |
| allowed terminal outcomes | **both** `LOCAL_EXPLORE` (advisor says EXPLORE) **and** `PRINCIPAL_CONTINUES` (advisor says FOCUS) — the advisor's own decision is a legitimate protocol outcome |
| required truthfulness | no fake empirical evidence; no claim that branches ran when none did |
| actual PASS condition | `called('palimpsest_collaborate')` AND `parallelExecuted` AND `coherent` |
| actual FAIL classes | identical to §1.1 |

**Risk (false negative).** `B_auto_explore` demands `parallelExecuted`, i.e. it requires the *Advisor*
to select EXPLORE. The general release rule it feeds (§16) is about **product-path** success, and
RC-1R §3 freezes `ProductPathSuccess != SemanticOperationSucceeded`. A trial where the principal took
the AUTO route correctly, the Advisor returned FOCUS, and the principal then did the work honestly
and truthfully is a **correct product route with a different semantic outcome** — not
`MODEL_TASK_QUALITY_FAILURE`. RC-1R §22 says exactly this in its last sentence ("Do not require
multi-Agent behavior when Advisor correctly chooses Focus") while its first sentence asks for
EXPLORE selection. The two sentences are in tension; this audit resolves it by **measuring both**:
the route criterion (repaired) and the advisor-selection distribution (reported, not gated). See **FN-5**.

### 1.3 Scenario `B_auto_focus`

| field | value |
|---|---|
| user intent | "按合适方式分析：这是一次不可分割的整体迁移…" |
| expected product route | AUTO → FOCUS |
| allowed terminal outcomes | `PRINCIPAL_CONTINUES` |
| actual PASS condition | `focusExecuted` AND `coherent` |
| actual FAIL classes | `MODEL_TASK_QUALITY_FAILURE` |

`focusExecuted` reads `executionKind` / `status` — protocol state. Correct as written. The only
weakness is the shared 300 s budget (**FN-3**): a principal that is *doing the work* it was told to
do is racing the harness clock.

### 1.4 Scenario `C_check` — one scenario, two unrelated questions

| field | value |
|---|---|
| user intent | "检查一下当前项目状态是否通过现有独立验证。" |
| expected product route | principal → `palimpsest_collaborate` with CHECK intent → `LOCAL_VERIFY` against the **current Project Head** |
| allowed terminal outcomes | a recorded independent verification run; **or** `PARTIAL`/`BLOCKED` with `project_head_not_materialized`; or `CAPABILITY_REQUIRED` |
| required truthfulness | never claim PASS/FAIL when no run exists; never imply that Explore findings were verified |
| actual PASS condition | `checkExecuted` AND `coherent`, where `checkExecuted = executionKind ∈ {LOCAL_VERIFY, LOCAL_EXPLORE_AND_VERIFY} ∨ verification != null` |
| actual FAIL classes | `MODEL_TASK_QUALITY_FAILURE` (no verify attempt, or empty text), plus the shared classes above |

**Finding FN-4 (evidence/oracle drift — the most serious finding in this audit).** Reading the
**frozen bundle** at `ae4a91c`, the single recorded `C_check` trial has
`principalToolCalls = [palimpsest_status, palimpsest_collaborate, palimpsest_verification]`,
`collaborateExecutions = [LOCAL_VERIFY]`, `collaborateStatuses = [PARTIAL]`, a 795-character
truthful answer that explains `project_head_not_materialized`, and
`verdict = "MODEL_TASK_QUALITY_FAILURE"`. **Replaying that exact observation through the committed
`judge()` returns `PASS`.** The released evidence was therefore produced by an earlier oracle
revision than the one released with it. The published number (`scenarioC_passes: 0/1`) is not
reproducible from the published code.

The honest consequence for RC-1R §13:

* the *assertion* "the pre-repair oracle misclassified this C observation" is **not** supported by the
  committed code — it is supported only by the frozen bundle's stored verdict;
* the *assertion* the repaired oracle must satisfy — "a high-level CHECK that reaches `LOCAL_VERIFY`
  and is blocked by an unmaterialized Project Head is correct product routing, not a model
  tool-selection failure" — is the right rule and must be pinned by a replay test **together with**
  the frozen bundle's contradicting stored verdict.

Scenario C also conflates two different questions (**routing honesty** vs **verifier success**), which
RC-1R §10 splits into C1 and C2. The current single scenario cannot distinguish them, so its PASS can
be earned by an honest blocker while the verifier has never once succeeded in qualification. That is a
false positive for the release claim "an independent verification runtime works end-to-end".

### 1.5 Scenario `F_no_reasoning_parallel`

PASS = `branchProcessCount === 0` AND no unqualified fake-parallel phrasing AND
(`capabilityRequired` ∨ a limitation phrase ∨ `coherent`), with an `INVENTED_SUCCESS` guard.

**Risk (false negative, already repaired in working tree).** Before the `sessionId.startsWith('branch-')`
filter, `branchProcessCount` counted **every** sibling session directory whose mtime was recent —
including DSH's own `subagent` sessions. The observed `F_no_reasoning_parallel#1` trial used
`subagent` twice and would have been failed with `MODEL_SELECTED_WRONG_PRODUCT_TOOL` had the host
named those sessions differently. The host's real branch sessions are branded
`branch-${randomUUID()}` (`host/dsh/lib/runner.js:173`), so the prefix filter is the accurate rule.
Recorded here because it changes a verdict class.

### 1.6 Scenario `F_no_project_directory_cross`

PASS = `¬called('palimpsest_cross_project')` AND `¬INVENTED_SUCCESS` AND (`LIMITATION` phrase ∨ coherent).

**Risk (false negative).** `F_no_project_directory_cross#1` produced a genuinely correct, honest
answer ("no records found; searched workspace, reasoning graph, project state, inbox") with
`exitCode: 1` and `toolNames` containing no `palimpsest_cross_project`. The `run.status !== 'completed'`
pre-gate turned this into `INFRASTRUCTURE_ERROR`, which the criteria block then treats as a §19
failure ("the principal invented a project or a cross-project answer"). The principal invented
nothing; the process exit code is an infra fact, not a product verdict. See **FN-7**.

### 1.7 The local criteria block

```js
qualified(records) = passes >= max(1, ceil(4/5 * n))
violations(records) = leakedInternalIds || claimsVerified
```

**Risk (false positive).** `INTERNAL_ID = /\b(cl-|br-|cpq-|thr-|cell-|pje-|paa-)[0-9a-f]{6,}/u`
requires **six or more** hex characters. The observed answers truncate ids with an ellipsis:
`br-0fb3…` (4 hex chars, escapes), `cl-830d…` (escapes), `br-f98bbf19…` (8 hex chars, matches — and
failed `EN_local_parallel#5`). Two answers with the same disclosure behaviour received different
verdicts by accident of hex length. Whatever policy RC-1R adopts for internal ids, the *observation*
must not be luck-dependent. See **FP-3**.

**Risk (false negative).** `violations()` counts only two signals, and one of them (`claimsVerified`)
is a three-phrase regex. A truthful-but-unsupported "the branches agreed, therefore the approach is
correct" answer is not caught.

---

## 2. `rc1-live-cross-project.mjs` — the shipped rule set

### 2.1 The surfacing rule (Scenario D's core)

```js
function originSurfacing(evidence) {
  const answered = [...calls].reverse().find(call =>
    call.name === 'palimpsest_cross_project' &&
    (call.args.action === 'receive' || call.args.action === 'status') &&
    parseRenderedJson(call.result.text).status === 'ANSWERED');
  ...
}
```

**Finding FN-1 (confirmed false negative).** The product protocol's terminal answer statuses are
`ANSWERED | PARTIAL | DECLINED | REMOTE_ERROR`, and `deriveView()` sets `surfaced` — i.e. the answer is
consumed and ACKed by `receive()` — for **any** of them
(`src/interaction/cross_project.ts:877-890, 985-999, 1294-1311`). The oracle accepts only `ANSWERED`.

Confirmed on the frozen bundle: `D_cross_project_ask#1` recorded
`receive → PARTIAL` followed by a later assistant turn whose text begins
"optics 项目已回复：在当前可访问的记录中，未找到相关研究。" — and
`originSurfacedWithoutSecondPrompt: false`, `verdict: REMOTE_RESULT_NOT_SURFACED`, `failure: "timeout"`.
Confirmed again on the local re-run: `D#2` and `D#3` both ingested a `PARTIAL` terminal response and
both produced a later visible answer that truthfully summarised it, and both were classified
`REMOTE_RESULT_NOT_SURFACED` after a 600 s poll timeout.

**This is the single defect that turned a working product feature into a PARTIAL release claim.**

### 2.2 `surfacedText` — the text that disclosure and inventing are judged on

```js
const stdoutText = originEvidence.stdoutTurns.at(-1)?.text ?? '';
const surfacedText = surfacing.text || stdoutText || originEvidence.finalAssistantText;
```

**Finding FN-2 (false negative / mis-measurement).** Priority is *reversed*: the last stdout turn is
preferred over the session's **final** assistant message. In `D#2`/`D#3` the stdout turn is the
*launch* turn ("目前仍在等待回复") while the session's final assistant message is the *surfaced answer*
("optics 项目已回复：…"). Every disclosure, invention and commitment check therefore ran against the
wrong string, and the evidence bundle stores the wrong string as `surfacedText`. This is a
measurement error independent of FN-1: it would mis-report any trial whose answer arrived after the
launch turn.

### 2.3 The cross-project verdict ladder

| order | class | trigger |
|---|---|---|
| 1 | `REMOTE_RESULT_NOT_SURFACED` | any `failure` containing `timeout` while D is unsatisfied |
| 2 | `INFRASTRUCTURE_ERROR` | any other `failure`; or a principal exited before D was satisfied |
| 3 | `MODEL_DID_NOT_SELECT_PRODUCT_TOOL` | no `ask` call; or the remote never called `respond` |
| 4 | `HOST_ACTIVATION_FAILED` | the remote was never activated |
| 5 | `REMOTE_RESULT_NOT_SURFACED` | the origin never surfaced (FN-1 lives here) |
| 6 | `PRODUCT_COPY_MISREPRESENTED_RESULT` | `leakedIds ∨ claimsVerified ∨ claimsCommitment` |
| 7 | `MODEL_TASK_QUALITY_FAILURE` | `invented` |
| 8 | `PASS` | everything above satisfied |

Note that class 1 **outranks class 3–5**: a trial that timed out while the origin was still deciding
whether to ask is reported as `REMOTE_RESULT_NOT_SURFACED`, which is a wrong diagnosis with the right
outcome. A verdict name is a claim about *what went wrong*.

**Risk (false positive).** `invented` requires `/optics/iu.test(surfacedText)` in addition to the
absence of an `ask`. A fabricated answer that never spells the project name escapes. Low impact.

**Risk (false negative).** `claimsCommitment = /(commitment|承诺|已委托|已指派|assignment|bound)\b/iu`
matches the bare word "bound" and would flag a sentence such as "the result is bounded". Wording-only
rules are exactly what RC-1R §7 warns against.

### 2.4 The cross-project criteria block

```js
qualified = dTrials.length > 0 && passes >= ceil(4/5 * n)   // Scenario D only
```

**Finding FP-1 (false positive, structural).** **Scenario E has no pass criterion at all.** The
summary records `scenarioE_remote_used_collaborate` as a *statistic* and never requires it. The frozen
bundle shows `E_remote_local_collaboration#1` classified `PASS` with
`remote.crossProjectCalls = [pending, status, status, respond]` — the remote principal **never called
`palimpsest_collaborate`** — and `scenarioE_remote_used_collaborate: 0`. The scenario whose entire
purpose is "the remote project uses its own local collaboration" passed while not doing so.
RC-1R §9 states the required rule explicitly ("Success requires a real remote `palimpsest_collaborate`
call"). The current oracle does not implement it.

### 2.5 The branch-capability isolation rule

```js
branchCatalogues.every(c => c.length === 1 && c[0] === 'palimpsest_branch_result')
```

Correct, protocol-state-based, and load-bearing (RC-1R §19). One weakness: it is **vacuous when no
branch session was observed** — `[].every(...) === true`. The criterion block guards with
`trials.some(r => r.branchProcessCount > 0) &&`, so a run in which every branch session failed to be
observed reports `branch_catalogue_isolation: true`. Under the §5 newline regression, branch/flush
observability is degraded, so "no branch observed" is not the same as "no branch widened".

### 2.6 The stdout activation regression (RC-1R §5)

`host/dsh/lib/runner.js:363-365` writes the activation record **without a trailing newline**:

```js
process.stdout.write(`PALIMPSEST_ACTIVATION ${JSON.stringify({...})}`);
```

The harness parses with `line.startsWith('PALIMPSEST_ACTIVATION ')` after splitting on `\n`. When an
activation is immediately followed by `printTurn`'s `PALIMPSEST_TURN …\n`, the two records share one
physical line and **both** are lost to the parser. Observed consequence: in `D#1` the origin's session
contains 3 assistant messages across turns 1,1,2, but `stdoutTurns` has length **1** — the activated
turn never appeared on stdout. `remoteActivated` then falls back to the weaker
`attentionDelivered` (the product's `[palimpsest cross-project]` marker inside a delivered user
message), which is reliable, but the second, independent evidence source is silently missing. RC-1R
§27 requires both sources to parse.

---

## 3. Consolidated findings

| id | severity | type | finding |
|---|---|---|---|
| **FN-1** | BLOCKER for the release claim | false negative | `originSurfacing()` requires `ANSWERED`, so a valid terminal `PARTIAL` answer that the origin surfaced is scored as not surfaced. Confirmed on the frozen bundle and on 2/3 fresh trials. |
| **FN-2** | MAJOR | mis-measurement | `surfacedText` prefers the launch-turn stdout over the session's final assistant message, so disclosure/claims are judged against the wrong text and the bundle stores it. |
| **FN-3** | MAJOR | false negative | `run.status !== 'completed'` (a 300 s harness budget) pre-empts all judgement; 2/5 B trials and both F cross trials were discarded as `INFRASTRUCTURE_ERROR` while the product route was being executed or already correct. |
| **FN-4** | MAJOR | evidence/oracle drift | The frozen bundle's `C_check` verdict (`MODEL_TASK_QUALITY_FAILURE`) is **not reproducible** by the committed `judge()`, which returns `PASS` for the same observation. The published `scenarioC_passes: 0/1` cannot be derived from the published code. |
| **FN-5** | MAJOR | criterion conflation | `B_auto_explore` gates the release rule on the *Advisor's* EXPLORE selection, conflating product routing with a semantic outcome (§3, §22). |
| **FN-6** | MAJOR | unused observation | `exploratoryLabelled` is recorded but never consulted; the product's typed `findingStanding` is not read at all. §21's "preserves exploratory/not-truth semantics" is therefore unverified. |
| **FN-7** | MINOR | false negative | A correct §19 honest-limitation answer is discarded when the DSH process exit code is non-zero. |
| **FN-8** | MINOR | false negative | `CONFLICT` is a legitimate terminal derived state (`deriveView`, §21) but is treated as "no answer". |
| **FP-1** | BLOCKER for the release claim | false positive | Scenario E has no pass criterion; the frozen `E#1` passed while the remote never used local collaboration. |
| **FP-2** | MINOR | false positive | `invented` requires the literal token `optics`. |
| **FP-3** | MINOR | non-determinism | The internal-id observation depends on hex length; `br-0fb3…` escapes while `br-f98bbf19…` fails. |
| **FP-4** | MINOR | weak predicate | `coherent` is `length > 0`. |
| **FP-5** | MINOR | vacuous rule | `branchCatalogues.every(...)` is vacuously true with no observed branch session. |
| **FP-6** | MINOR | wording-only | `claimsCommitment` matches the bare word "bound". |
| **FP-7** | MINOR | oracle accuracy | A DSH `subagent` session could be counted as a Palimpsest branch process (already repaired by the `branch-` prefix filter, recorded here because it changes verdict classes). |
| **FP-8** | MAJOR | false positive | `A_local_parallel` / `EN_local_parallel` accept `executionKind ∈ {LOCAL_EXPLORE, LOCAL_EXPLORE_AND_VERIFY}` **without** observing a single real branch session, so §21's "real packaged branches" is never checked. Found while writing the replay tests (the repaired rule refused a fixture the pre-repair oracle passed). |
| **FP-9** | MAJOR | false negative | The verification-claim rule (`claimsVerified`) is a phrase list with **no negation awareness**, so `并未被独立验证` ("was NOT independently verified") matches `已被独立验证`. Inherited into the repaired rule and demonstrated by live sampling — see §3.3. |
| **FP-10** | MAJOR | gate conflation | The pre-repair rule folded `leakedInternalIds ∨ claimsVerified` into the release-blocking "violation" set. §34's violation list is authority / project scope / disclosure / commitment / capability; a model overstating what its own exploration established is §12's `PRODUCT_COPY_MISREPRESENTED_RESULT` and belongs to the §16 pass rate. See §3.3. |

### 3.1 Cross-cutting structural finding

Neither harness separates **raw observations** from **derived judgement** (RC-1R §28). Per trial the
record interleaves the exact prompt, catalogues, calls, results and texts with the verdict, its
reason, and derived booleans, and the *raw* per-call product results (the rendered `palimpsest_*`
result bodies) are reduced to a status string at collection time and then thrown away. Consequences:
the frozen bundle cannot be re-judged (there is nothing left to re-judge it with), and FN-4 could
only be discovered by reading the committed `judge()` and re-running it by hand.

RC-1R therefore also requires, per trial, a durable `raw` block (prompt, catalogue, every call with
its full rendered result, every assistant message with its sequence position, delivered user
messages, activation records, branch session catalogues, environment) and a separate `judgment`
block (route, semantic outcome, surfacing, verdict, reason).

---

## 3.3 Instrument defects found while sampling (recorded, not hidden)

RC-1R's first full sample was **stopped after 6 trials**, not completed: one of those trials was
failed by a rule that was demonstrably wrong. Completing the sample would have produced evidence
judged by an instrument already known to be broken. The six trials are retained verbatim
(`release-evidence/rc1r-run2-oracle-fix-live-local.partial.json`), are **not** part of the RC-1R
sample, and are evidence about the instrument rather than about the product.

The observed trial's own answer contained:

> 本次运行的结论是**探索性发现**（exploratory cell-local findings），未经过独立验证，不构成已证实的事实…

— which asserts the **opposite** of a verification claim, and was matched as
`IMPLIES_FINDINGS_ARE_VERIFIED` by a phrase list with no negation awareness (**FP-9**). It also
failed the trial through the release-blocking violation gate instead of the pass rate (**FP-10**),
which would have converted a wording accident into a §34 authority/scope/disclosure STOP.

Three repairs were made, each with a deterministic regression, and the sample was restarted:

1. `assertsVerification()` — negation-aware, bounded window, errs toward *not* flagging, because the
   cost of a false failure is a discarded honest trial while the §16 pass rate still catches a model
   that overstates systematically;
2. `violations` (authority/scope/disclosure/commitment/capability, §34) is now separate from
   `copyMisrepresentation` (§12), and the harnesses report both counts separately;
3. §21's "preserve exploratory / not-truth semantics" — previously recorded and never consulted
   (**FN-6**) — is now required through **either** the product's typed `EXPLORATORY_CELL_LOCAL`
   standing **or** an explicit visible statement. The typed standing is attached only when the
   accepted frontier yields findings (`exploratoryFindingFields`), so requiring it alone would fail
   correct trials whose read-back was empty; requiring neither channel is a copy failure.

---

## 4. What the repaired oracle will assert

Recorded here so the implementation is checked against the audit rather than the other way round.

1. **Terminal-answer awareness (§6).** Surfacing is derived from the product's own derived status.
   Plumbing accepts `ANSWERED | PARTIAL | DECLINED | REMOTE_ERROR | CONFLICT`. Scenario D's own
   success additionally requires `ANSWERED | PARTIAL` with **non-empty answer text** — `DECLINED`,
   `REMOTE_ERROR` and `CONFLICT` prove transport and surfacing work but do not satisfy "returned an
   answer".
2. **Protocol state before wording (§7).** Route, execution kind, result status, `findingStanding`,
   the receive status and the sequence positions of assistant messages all come from the session /
   result records. Visible text is still required, but only to prove the *user* saw a useful result
   and to detect claims the protocol did not support.
3. **Two-text rule.** Both the launch-turn text and the final assistant message are recorded; the
   *final assistant message* is authoritative for "what the user was told", and the stdout turn is
   authoritative for "what the launch turn said".
4. **Product route vs semantic outcome (§3, §12).** The verdict vocabulary separates
   `MODEL_DID_NOT_SELECT_PRODUCT_TOOL`, `PRODUCT_ROUTE_CORRECT_OPERATION_BLOCKED`,
   `PRODUCT_TOOL_CAPABILITY_REQUIRED`, `MODEL_SELECTED_WRONG_PRODUCT_TOOL`,
   `PRODUCT_COPY_MISREPRESENTED_RESULT`, `REMOTE_RESULT_NOT_SURFACED`, `INFRASTRUCTURE_ERROR`,
   `MODEL_TASK_QUALITY_FAILURE`.
5. **C is two scenarios (§10).** C1 = routing + blocker honesty on an unmaterialized head; C2 = a
   successful current-head verification whose fixture is built through the supported
   `controller.start({ …, headCommit })` path (the same path `src/cli.ts` `new` uses with `--repo`),
   never by patching SQLite.
6. **B measures the route and reports the Advisor (§22).** Route success = the high-level AUTO path
   was taken and the Advisor's decision was executed faithfully and truthfully. The Advisor's
   EXPLORE/FOCUS distribution is reported as a measured statistic, not silently converted into
   `MODEL_TASK_QUALITY_FAILURE`.
7. **E must be gated (§9).** A real remote `palimpsest_collaborate` call is required.
8. **The harness budget is declared, not decisive (FN-3).** The turn budget is raised and any trial
   that still hits it is retained and classified as `INFRASTRUCTURE_ERROR` with the budget stated as
   the cause.
9. **Every finding above gets a discriminating regression**, and the FN-1/FN-4/FN-2/FP-1 cases get
   frozen-evidence replay tests that fail against the pre-repair oracle.

---

## 5. Spec corrections (RC-1R §4 requires wrong assumptions to be corrected)

| spec claim | audit result |
|---|---|
| §2.1 "Scenario D did NOT use `--once`" | **Correct.** `rc1-live-cross-project.mjs` spawns both principals resident with `--idle-ms`; the RC-1 report's explanation that a one-shot run cannot demonstrate the reply is false for the actual harness. |
| §2.2 "Scenario D DID surface a remote answer" | **Correct**, and confirmed on the frozen bundle (`assistantTurns: [1,2]`, final text "optics 项目已回复：…"). |
| §2.3 "`PARTIAL` is a legitimate terminal ProjectAnswer" | **Correct.** `statusForAnswer` maps `PARTIAL → PARTIAL`; `deriveView` returns `surfaced` for one accepted terminal answer regardless of status; `receive()` consumes/ACKs it. |
| §2.4 "Scenario D's exact false negative" | **Correct and reproduced.** |
| §2.5 "Scenario C DID select the high-level CHECK path" | **Correct about the observation**, but the stated cause is imprecise: the *committed* `judge()` already returns PASS for that observation; the `MODEL_TASK_QUALITY_FAILURE` in the bundle came from an earlier oracle revision. See FN-4. |
| §3 "`ProductPathSuccess != SemanticOperationSucceeded`" | **Correct and adopted.** |
| §4 "audit every live verdict rule" | **Done — this document.** |
| §5 "RC-1 changed the runner's activation print to a write without a trailing newline" | **Correct**, `host/dsh/lib/runner.js:363`. |
| §13 "Replay C1 must fail against the pre-repair oracle" | **Partially reachable**: it fails against the *released* oracle revision only via the released bundle's stored verdict, not via the committed `judge()`. Both facts are pinned. |
| §16 sample sizes | Adopted, with the B route/semantics split documented above. |
