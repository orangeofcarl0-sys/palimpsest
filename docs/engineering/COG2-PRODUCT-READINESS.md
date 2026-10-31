# COG-2 — Product Readiness

**Baseline:** `c8fe505` (COG-1 Evidence Freeze), tree `13623581`, plus this stage's bounded correction.
**Method:** source revalidation at the freeze, a live mechanism check with the real model, and the
recorded trials. Nothing here is inferred from a capability's name or from a historical document.

This report answers the readiness question in the ruling's ladder: *implemented → composed →
model-reachable → discoverable → produces a result → consumed → changes later work*.

---

## 1. Two contexts, kept distinct

### Cognitive project context — ESTABLISHED

A test-owned world (`harrowgate`) with a real git repository, a valid ProjectIR created through the
controller's own `start` (`src/tools/controller.ts:1250`), and journal entries written through the
project workspace's own `recordJournalEntry` (`src/project_workspace/service.ts:553`). The project
was created by the operator, not through a fake completion contract. All reads went through the
product's own surface.

### Managed execution context — NOT ESTABLISHED, and not claimed

`palimpsest_begin` requires an in-place deployment, an empty write scope, a **confirmed completion
standard**, a clean tree at the canonical head, and an independent verifier
(`src/adapters/dsh/work.ts:99`). This test deployment has no confirmed completion standard, so a
managed Work attempt would be refused. The stage did not invent one to make the interface pass.
Formal Work remains git-shaped by construction: a non-worktree placement is refused
(`src/work/attempt_execution.ts:205`), a claim materialises `git clone --shared`
(`src/effects/git_port.ts:567`), and promotion is `git merge --no-ff` (`src/effects/git_port.ts:1140`).

The cognitive tests did not need Work, and no result in this stage is a Work result.

---

## 2. The ladder

| capability | implemented | composed | model-reachable | discoverable | produces a result | consumed | changes later work |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Project genesis (`palimpsest_start`) | yes (`controller.start`) | yes, base tool (`src/tools/tools.ts:116`) | yes | only if the model chooses it | ProjectIR revision 0 | yes (D/CSEAM overview) | indirectly, by making the project exist |
| Project read (`palimpsest_project`) | yes | yes (`src/adapters/dsh/project.ts:22`) | yes | **no** on a neutral task; **yes** with a task-shaped invitation or the launch seam | overview/open loops/history | D: 7 calls; CSEAM: 3; C/P2: 0 | D/CSEAM use the prior result |
| Journal read (`journal_entries`) | yes (`src/adapters/dsh/project.ts:78`) | yes | yes | **no** by default; **yes** after the seam | 5 or 8 entry bodies | positive control, D, CSEAM, P2SEAM | CSEAM: plan says no Friday opening; P2SEAM uses the 2023 numbers |
| Journal write (`journal`) | yes | yes | yes | yes when instructed (P1) | 5 entries | P2SEAM | yes, once discovered |
| Journal write fence | yes (`src/project_workspace/service.ts:519`) | yes | yes (refusal) | n/a | typed `unknown_project` | COG-1 retest | prevents pre-project knowledge |
| Collaboration FOCUS | yes | yes | yes | yes | a plan with `PRINCIPAL_CONTINUES` | not selected by the model in these trials | n/a (principal continues) |
| Collaboration PARALLEL | yes | **no** in this deployment | yes (tool is present) | refused honestly | `CAPABILITY_REQUIRED` | none | none |
| Managed Work (`palimpsest_begin`) | yes | yes, but no confirmed standard | yes (tool) | refused without a standard | none | none | none |
| Attention activation | yes | **no** (`activation: "none"`, pull mode) | n/a | n/a | no signal activated | none | none |
| Delegation delivery | yes | **no** (requires `activation: "dsh"` and a bound session) | n/a | n/a | none | none | none |
| Cross-project ask | yes | **no** (no peer directory configured) | yes (conditional tool) | refused | none | none | none |
| Knowledge selection | yes | host-supplied context only | **no model-facing selector** | n/a | context in the prompt | n/a | n/a |
| Project Intent | yes | yes | **no model-facing tool** | n/a | none | none | none |
| Trajectory | yes | worker-prompt-facing | **no model-facing tool** | n/a | worker context | n/a | n/a |

The last three rows are the same constraints COG-1 recorded; they were revalidated by source
inspection and the live tool list, not assumed.

---

## 3. What the positive control established

A labelled mechanism check asked the model to list every recorded journal entry and say which bear
on Friday evening events. It made **12 tool calls, 1 of them `palimpsest_project action=journal_entries`**,
and reported all five entries with their kinds and titles. It also read the source pack and
correctly identified the stale 2019 climate claim and the misleading survey inference.

That proves the read surface is reachable and the content is delivered. It does **not** prove
spontaneous use; the instruction was explicit and the run is labelled diagnostic in
`research-evidence/cog2/scores.json`.

---

## 4. Where readiness actually fails

The failure is not in the store, the schema, the write fence or the read result. It is in the
**moment of selection**:

- C (valid ProjectIR, 5 entries, neutral task): **0 product calls** in 686 seconds. The journal was
  never read.
- P round 2 (8 entries from an earlier model session, cold process, plan task): **0 product calls**
  in 1,066 seconds. The earlier work was never discovered.
- D (same world plus one sentence saying earlier work may be inspected): **7 product calls**,
  including `journal_entries`.
- CSEAM (same neutral task as C, plus the bounded launch seam): **3 product calls**, 304 seconds,
  and the plan uses the recorded negative result.

So: capability availability was never the bottleneck. **Discoverability at the principal's first
move was.** The bounded correction addresses exactly that and nothing else.

---

## 5. What is genuinely usable

- The cognitive project context: create, write, read, and carry knowledge across processes.
- The journal read returns bodies, not titles only.
- A principal with a reason to look can inspect the project, its open loops, its history and its
  journal, and can record decisions and new entries.
- Honest refusals: unknown project, foreign project, missing ProjectIR, unavailable PARALLEL,
  missing completion standard. None of these silently substituted an empty result.

## 6. What is not usable in this deployment

- Managed Work without a confirmed completion standard.
- PARALLEL collaboration (reasoning branches unavailable).
- Live attention activation and delegation delivery (`activation: "none"`).
- Cross-project ask (no peer directory).
- A model-facing knowledge selector, Project Intent, or trajectory tool.

These are deployment/composition facts, not claims that the code does not exist. The stage did not
build replacement infrastructure for them.

---

## 7. Readiness verdict

**The cognitive product is ready enough to be tested and is now discoverable at launch; the
managed-execution and live-collaboration product is not composed in this deployment.** A future
stage that needs Work or PARALLEL must first establish the missing completion standard and the
reasoning-branch/peer configuration, and must test them as their own readiness question — not
infer readiness from the cognitive context.
