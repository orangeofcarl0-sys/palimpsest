# RC-1 — Live principal gap assessment (RC0)

Baseline: `6c7181d66816a70cb41583be00e0676e56fce06d` (canonical main after UX-C).
Stage: `RC-1 — Live Principal Product Qualification & Interaction Surface Closure`.
Spec §4 mandates this audit before any code or docs change.

Method: read the product surfaces, the shipped host, both UX-C dogfoods and the existing
docs; then **ran a real model-driven DSH principal** over a normal deployment profile
(`scripts/release/rc1-live-local.mjs`, one trial per scenario) and read the observable
evidence only — the `request/header` tool catalogue, `tool/call` records, the final visible
assistant text, and Palimpsest reasoning events. No chain-of-thought was read or stored.

---

## 1. The decisive answer: a real provider IS available, and the live loop works

`~/.dsh/settings.yaml` configures `provider: openrouter-stealth`, `model: stealth/union-alpha`
(with a local gateway at `http://127.0.0.1:7866/v1`). The first live trial produced a real
model turn — `assistant/message`, `tool/call`, `tool/result` records exist in the principal
session — so **RC-1's "no real model/provider" PARTIAL condition does not apply**. This
document names one supported configuration only (§12); nothing here generalises to other
models.

**The release-critical loop already fires end to end.** For the AUTO prompt — ordinary
Chinese, no tool named, no enum, no ids:

```text
user: 先判断这个问题是否值得并行探索，再按合适方式分析：比较两个彼此独立、可单独验证的缓存策略。
principal tool calls: ["todo_write", "palimpsest_collaborate", "todo_write"]
verdict: PASS   (wall 116 s, catalogue 44 tools)
```

That is the product promise working through the shipped host with a real model. The failures
are the other half of the story, and they are **discoverability**, not capability.

## 2. The twenty-four §4 questions

1. **What tools does a normal principal see?** **44**, of which **19 are `palimpsest_*`** and
   25 are host tools (`glob`, `grep`, `read`, `write`, `edit`, `pwsh`, `subagent`, `workflow`,
   `web_fetch`, `web_search`, `todo_write`, …). Recorded verbatim in the evidence bundle.
2. **What do the two product tools describe?** `palimpsest_collaborate` is described as
   "one high-level request for local multi-Agent collaboration… you do not need to name a
   recipe, build a plan, or manage a reasoning cell or branch" with actions `plan|run`.
   `palimpsest_cross_project` says the same for a cross-project Ask. **The problem is not
   falsity — it is that neither description contains the words a user actually says.** The
   AUTO prompt worked; the explicit-parallel prompt did not, and the difference is phrasing.
3. **Which expert tools compete?** All of them: `palimpsest_advisor`, `palimpsest_recipes`,
   `palimpsest_recipe`, `palimpsest_reasoning`, `palimpsest_verification`, plus the Work CLI
   (`palimpsest_start/plan/next/run/claim/report/gate`). 19 Palimpsest tools is a lot of
   surface for one model to choose from, and the low-level ones are more "obviously" named
   for a model than the product ones.
4. **What does the installed DSH skill tell the model Palimpsest is for?** **Nothing — the
   shipped DSH principal never reads `.zcode/skills/palimpsest/SKILL.md`.** `grep -rn skill
   host/dsh/lib/*.js` finds no skill loading; the `skill` tool in the catalogue is the DSH's
   own native skill system. The file is a **ZCode client** skill. So §2's premise ("this
   mismatch may directly reduce live model tool-selection quality") is only half right:
   rebasing the skill is required for the ZCode-facing product path, but it cannot change
   the DSH principal's selection. **The description text is the lever there.**
5. **Does the skill tell the model when to prefer the high-level tools?** It does not — it
   teaches a durable CLI orchestration protocol (task graph, attempts, gates, promotion) and
   never mentions `palimpsest_collaborate` or `palimpsest_cross_project`.
6. **Does README's primary promise match UX-C?** No. README leads with "持久化 AI 项目操作系统"
   and its Quick Start is `new / run / claim / report / gate / promote` — the expert CLI, not
   the shipped one-request experience.
7. **What deployment fields are required for packaged local Explore?** `reasoning: {}` and
   nothing else. Verified live: a profile whose only collaboration configuration is
   `reasoning: {}` composed a deployment-owned reasoning store and real ephemeral branches.
8. **What extra is required for cross-project Ask?** `projectDirectory` (plus `directory` for
   the peer advertisement). Confirmed by the catalogue: **`palimpsest_cross_project` is absent
   from the 44-tool catalogue** precisely because this single-project profile declares no
   `projectDirectory` — the face is composed only when the capability exists (honest
   composition, not a hidden tool).
9. **Is `reasoning: {}` the only local-collaboration switch?** Yes for the packaged bundle;
   `databases.reasoningStorePath` is the single advanced override (§SC-12 of UX-C).
10. **Does the real principal receive the packaged tools without manual integration?** Yes —
    the live catalogue contained `palimpsest_collaborate` with no harness-side tool
    registration.
11. **Can the current environment run a real model-driven principal?** Yes (see §1).
12. **Which provider/model?** `openrouter-stealth` / `stealth/union-alpha`.
13. **Can two real DSH principal processes run concurrently?** Yes — the UX-B/UX-C rigs already
    run two deployments with two pumps; the cross-project live harness starts two principals.
    Sharing one profile at the same time is not supported (one session per profile per cwd),
    so the harness uses two profiles.
14. **What observable events prove product tool selection without reading CoT?** The
    `request/header` tool catalogue (what was offered), `tool/call` name + arguments,
    `tool/result`, Palimpsest reasoning events (`CANDIDATE_SUBMITTED`, `VERIFICATION_RECORDED`
    standing, `CLAIM_ADMITTED`), host activation lines, and the final visible assistant text.
15. **What proves a useful visible result?** A non-empty final assistant message that answers
    the task, uses finding content rather than ids, and — where applicable — states the
    exploratory standing.
16. **Which UX-C carry-forward items fire here?** The live-principal proof (UX-C §4.2) is
    being closed by this stage; the cold-resume gap (§4.6) does not naturally fire; cost
    presets (§4.4) get their first real data; the branch artifact (§4.5) is observed and
    recorded, not deleted; the Proof coupling (§4.7) does not fire (no Proof store is wired).

### The observed selection failures, and their classification (§38)

| Scenario | Prompt (abridged) | Principal tool calls | Verdict |
| --- | --- | --- | --- |
| A explicit parallel | 并行研究一下这个问题，给我两种独立思路… | `["glob"]` | `MODEL_DID_NOT_SELECT_PRODUCT_TOOL` |
| B AUTO | 先判断…是否值得并行探索，再按合适方式分析… | `["todo_write","palimpsest_collaborate","todo_write"]` | **PASS** |
| B AUTO coupled | 不可分割的整体迁移…必须原子完成 | `["palimpsest_advisor" ×5, "palimpsest_collaborate"]` | `PRODUCT_TOOL_CAPABILITY_REQUIRED` — it consulted the advisor five times, then reached the product tool and the run reported a capability limitation |
| C CHECK | 检查一下当前项目状态是否通过现有独立验证 | `["palimpsest_status","palimpsest_verification"]` | `MODEL_DID_NOT_SELECT_PRODUCT_TOOL` — it chose the **expert** verification tool, which is honest but not the product path |

**No trial produced an authority, scope or disclosure violation**, and none leaked internal
ids into its answer. The failures cluster exactly where §21 predicts: product discoverability.
§21's authorised remedy is to *"improve truthful skill/tool descriptions before inventing a
new router plane"* — which is what this stage will do.

## 3. Corrections this audit makes to the spec

1. **§2/§7 assume the DSH principal reads the skill.** It does not. The skill must be rebased
   for the ZCode-facing product path (and to stop teaching obsolete choreography as the
   primary story), but live selection is driven by the **tool descriptions** and by the
   user's phrasing. Both get fixed; neither is described as the other.
2. **§9's "do not hide expert tools"** is not at risk: the expert tools stay, and the fix is
   description quality plus doc hierarchy — no router plane, no hidden tools, no model-specific
   hack.
3. **Scenario C's expectation needs care.** The trial used the expert `palimpsest_verification`
   tool, which performs the *same* current-Project-Head verification. That is not a wrong
   semantic outcome, but it is not the product path, so it counts as a selection failure for
   qualification while the truthfulness requirement (never claiming findings were verified)
   held throughout.
4. **§13's 5-trial discipline is affordable but slow**: one live turn takes 50–193 s, so a
   full A/B/C/F qualification is roughly 30–60 minutes of real model time. The run records
   wall-clock, tool-call counts, branch events and message counts per trial (§31); token usage
   is **not** exposed by this host and is therefore not invented.
5. **§15's "decomposable + verifiable" wording matters more than the spec implies**: the
   coupled prompt reached the product tool and returned a capability limitation rather than
   silently doing single-agent work — which is the honest behaviour §19 asks for, and worth
   recording as evidence rather than as a failure.

## 4. What RC-1 therefore is

A **release qualification plus a product-surface correction**, not a new capability:

- improve the two product tools' **truthful descriptions** so ordinary user language reaches
  them (no hidden tools, no model-name special-casing, no prompt-side instruction);
- rebase **README, docs/user-guide.md and the DSH skill** so effortless collaboration is the
  primary story and the durable Project OS/kernel is the implementation foundation, with the
  Work CLI as an explicit expert surface;
- ship **minimal example profiles** (single project; a two-project detector/optics pair) that
  pass strict profile parsing and contain no credentials;
- qualify with **real live principals**: ≥4/5 trials per stochastic scenario on the documented
  configuration, **every** trial retained and classified, and the real branch catalogue still
  exactly `["palimpsest_branch_result"]` (any wider catalogue is a blocker);
- record the environment, the costs and the honest limits in a release evidence bundle.
