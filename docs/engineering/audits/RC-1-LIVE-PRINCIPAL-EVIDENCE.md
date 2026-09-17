# RC-1 — Live principal product qualification: evidence

Baseline: `6c7181d66816a70cb41583be00e0676e56fce06d` (canonical main after UX-C).
Stage: `RC-1 — Live Principal Product Qualification & Interaction Surface Closure`.
Companion JSON bundle: `release-evidence/rc1-live-principal.json` (composed from
`rc1-live-local.json` and `rc1-live-cross-project.json`).

This document contains only observable evidence: the exact user prompt, the principal's
`request/header` catalogue, tool calls and results, Palimpsest semantic state, host
activation evidence and the final visible assistant text. **No chain-of-thought is read or
stored**, and **no API key or token appears anywhere** (spec §11/§39/§41). Token usage is
**not exposed by this host** and is therefore never invented (§31).

---

## 1. Environment record (§12)

| Field | Value |
| --- | --- |
| provider | `openrouter-stealth` (from `~/.dsh/settings.yaml`; observed per trial in `request/header.config`) |
| model | `stealth/union-alpha` (observed per trial in `request/header.config`) |
| DSH bin | `C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js` |
| Node | see bundle `environment.nodeVersion` (`v24.14.1`) |
| Palimpsest commit | see bundle `environment.palimpsestCommit` |
| Ordarium | `1.3.1` (package.json release pin) |
| OS/runtime | `win32 x64` |

This proves **one** supported configuration only. Nothing here generalises to other models
(§12), and no model name is special-cased anywhere in the product or the harnesses (§37).

## 2. Method — real principals, no substitute

Both harnesses spawn the **shipped** DSH host (`dsh --profile …`) over a normal deployment
profile whose only collaboration configuration is `reasoning: {}` (plus `projectDirectory`
for cross-project). They:

- never script the principal, never mock the LLM, and never call `application.*` or a
  product tool on the model's behalf;
- prepare only the deployment profile and the project FIXTURE the user's sentence presumes
  (so CHECK has a real current Project Head);
- read evidence afterwards from the durable DSH session artifact and the Palimpsest stores.

`request/header.tools` is read verbatim from the principal's own session; the catalogue is
44 tools, 19 of them `palimpsest_*`.

## 3. Product-surface changes this stage makes (§9 / §5–§8)

### 3.1 Truthful tool descriptions

`palimpsest_collaborate` and `palimpsest_cross_project` descriptions now carry the
vocabulary a user actually says — `并行探索` / `多个独立思路` / `比较几种方案` /
`检查当前项目状态` and `parallel investigation` / `independent approaches` /
`compare the options` / `check the current project state`; `问一下另一个项目` /
`另一个项目之前是否研究过…` and `ask the optics project` / `consult the other project` —
while keeping the semantics exact: Explore findings are exploratory and not Evidence;
CHECK verifies the **exact current Project Head** and never the findings; Ask is not a
commitment and nothing else is attached. No authority claim, no "always call me", no
model/provider name, no kernel policy duplication. Expert tools remain registered.

### 3.2 Docs / skill / examples

- `README.md` leads with one project Agent → local Explore/Check → another project when
  asked → durable state underneath; the durable Project OS story is the "under the hood"
  architecture section; the Work CLI is an explicit expert/automation/debugging section
  (not deleted).
- `docs/user-guide.md` §1 is a runnable primary path (profile → `reasoning: {}` → shipped
  principal → talk) plus the cross-project variant.
- `.zcode/skills/palimpsest/SKILL.md` is rebased around the product with the current
  triggers in its frontmatter, the §8 firewalls preserved, and the durable Work CLI in an
  explicit advanced section.
- `examples/deployment/{single-project,two-project-detector,two-project-optics}.json` ship
  local placeholder paths, no credentials, and are parsed by the STRICT parser in
  `test/p_deployment.test.ts`.

### 3.3 Host observability (no semantics)

`host/dsh/lib/runner.js` now waits for, flushes and reports the turn a successful
activation queued (same `PALIMPSEST_TURN` record as a launch turn). This closes an
observability/durability gap; it adds no authority, capability or semantic species.

> **RC-1R §5 correction:** this same change wrote the `PALIMPSEST_ACTIVATION` record without
> a trailing newline, so the activation record and the `PALIMPSEST_TURN` that follows it
> shared one physical line and *both* were lost to a line-oriented parser. RC-1R restores the
> newline and gates on it. See `RC-1R-QUALIFICATION-ORACLE-ASSESSMENT.md` §2.6 and
> `RC-1R-DELIVERY.md` §3.

## 4. Trial matrix

**This section was never completed in RC-1**, because RC-1's qualification ended PARTIAL
after one local trial and two cross-project trials, and the stage's remaining budget went to
the product-surface work. The placeholders that stood here have been removed rather than left
to look like missing evidence.

The authoritative per-trial record for the **corrected** qualification is
`release-evidence/rc1r-live-principal.json` (RC-1R), with the readable report in
`RC-1R-DELIVERY.md`. The RC-1 bundles themselves are preserved byte-identically at
`release-evidence/rc1-historical-ae4a91c-live-local.json` and
`release-evidence/rc1-historical-ae4a91c-live-cross-project.json`, and are the replay inputs
of `test/rc1r_oracle_replay.test.ts`.

## 5. What RC-1's own evidence actually showed (established by RC-1R)

RC-1's PARTIAL verdict was correct, but its *recorded reasons* were not reproducible from its
own released code. RC-1R's audit established:

| RC-1 statement | Measured truth |
| --- | --- |
| Scenario D failed because a one-shot `--once` run cannot surface the reply | False for the actual harness (both principals were resident). D ingested a terminal `PARTIAL` answer and the origin presented it on a later turn; the oracle accepted only `ANSWERED`. |
| Scenario C was `MODEL_TASK_QUALITY_FAILURE` | The frozen bundle stores that verdict, but the committed `judge()` returns `PASS` for the same observation: the released evidence and the released oracle were different revisions. |
| "Scenario D PASS in ≥4/5 trials" (release checklist) | The frozen bundle records `scenarioD_passes: 0/1`. |

## 6. Final line

`PALIMPSEST RC-1 LIVE PRINCIPAL PRODUCT QUALIFICATION: PARTIAL` — unchanged, and now
correctly explained. The successor stage's result is recorded in `RC-1R-DELIVERY.md`:
`PALIMPSEST RC-1R LIVE QUALIFICATION ORACLE & FULL SAMPLE CLOSURE: PARTIAL`.
