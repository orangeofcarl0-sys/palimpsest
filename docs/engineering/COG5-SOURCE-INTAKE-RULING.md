# COG-5 — External Source-Intake Ruling

**Status:** architecture ruling, written before any production change.
**Branch:** `palimpsest-cog5-trustworthy-continuation`
**Incoming baseline:** `924d30414ffd2a7b5f8f6aa297b8a29c9065c8aa` / tree `1b451532aa07da1f8035fe9f5855b6e62fd5781c`
**Primary question:** how may an external reality become an authorized execution basis?

This document answers §6 of the COG-5 mandate. It identifies the existing owner of head authority, evaluates
the three lawful routes, and decides whether the existing Work + Promotion path can accept an external source
change without a new authority root. It does not move `main`, create a PR, or implement B3.

---

## 1. The owner of head authority

The canonical head is **not** `git HEAD`. It is the `head_commit` field of the ProjectIR, and it advances only
through a **proven promotion chain**.

| fact | owner | code |
| --- | --- | --- |
| ProjectIR head | the project row / `ProjectIR` | `src/tools/controller.ts`, `src/schema/models.ts` |
| proven effect head | `deriveProjectHeadStatus()` over committed `PROMOTION_COMMITTED` facts | `src/domain/project_head.ts:203-235` |
| head reconciliation proposal | `compileProjectHeadReconciliation()` | `src/domain/project_head.ts:264-372` |
| reconciliation commit | `ProjectHeadService.reconcile()` → `controller.planReconciled(..., { headAdvance })` | `src/work/head.ts:147-203`, `src/tools/controller.ts:1819-1827` |
| task reauthorization onto the new base | `TASK_REAUTHORIZED` inside the same atomic revision batch | `src/tools/controller.ts:1380-1480`, `:1630-1670` |
| D2 execution-base guard | live HEAD = project head = proven effect head = envelope base | `src/work/attempt_execution.ts:340-357` |

The chain rule is strict: the first applicable promotion must start at the project head, every later promotion
must chain from the previous resulting head, and a mismatch is a `head_conflict` — never skipped, never
"take the last resulting head". `reconcileProjectHead()` advances only to the **proven effect head** of that
chain. It does not adopt an arbitrary ambient `git HEAD`.

Quiescence is a precondition: no `ACTIVE`/`VERIFYING` task and no open attempt. A promoted task must reach
`SATISFIED` first. When the head advances, retained `READY`/`BLOCKED` tasks are reauthorized onto the new base
**inside the same atomic batch**, so a subsequent D2 attempt sees a consistent envelope.

The D2 guard is correct and is preserved:

```text
live HEAD = project head = proven effect head = TaskEnvelope.base_commit
```

A direct external commit moves only the live HEAD. It does not move the project head or the proven effect head,
so the guard refuses with `HEAD_BASIS_MISMATCH`. That refusal is a safety property, not a bug.

---

## 2. The three routes

### B1 — external revision remains candidate source

The External Asset Library (`src/external_assets/**`) can:

- read an external library (search / inspect);
- prepare read-only reference, import or publication candidates;
- commit one `EXTERNAL_ASSET` ProjectAssetAssociation and one ProjectJournal entry;
- use the governed external-effect path for publication.

It **cannot** reach Work Evidence, Proof, Reasoning, the promotion ledger or the ProjectIR head. The service
module states this explicitly: it "can reach no Work, Proof or Reasoning owner ... so a 'bridge' from an
external asset to Work Evidence, Proof evidence/claims, Reasoning claims or Decisions is not merely forbidden —
it is unreachable" (`src/external_assets/service.ts:17-21`).

Therefore B1 can make an external revision **inspectable, citable and discussable**. It cannot make it an
execution basis. That is the correct boundary: an import into the Journal is not a Work Promotion or a
ProjectIR revision.

### B2 — existing Managed Work accepts the change

This is the preferred hypothesis, and the evidence supports it. The route is:

```text
canonical ProjectIR at H0
  → operator authors an explicit source-intake Work task
      objective:   apply the exact external candidate to the declared path(s)
      write_paths: exactly the candidate paths
      required_artifacts: the observed result artifact(s), if any
  → Work materializes an isolated execution world at H0
  → the worker applies the candidate's exact bytes and commits
  → completion evaluation observes the changed paths vs the envelope's write scope
  → ATTEMPT_RESULT (result commit R, parent H0)
  → operator Promotion against canonical expected head H0
      → PROMOTION_COMMITTED, resulting head H1
  → head reconciliation (after quiescence) advances ProjectIR to H1
      → retained READY/BLOCKED tasks reauthorized onto H1 in the same batch
  → subsequent D2 Work prepares with envelope base H1 and passes the four-way guard
```

**Can Work express source intake without lying about Work identity?** Yes. The Work identity is the
operator-authored task and attempt; the external candidate is an **input artifact**, not the work's identity
and not an approval. The task's objective names the exact candidate and its origin; the candidate bytes are
immutable and content-addressed; the result commit is the Work's output. The source's own Git commit identity
is provenance, not authority. The operator's plan revision and promotion are the authority.

**Does the candidate require a new source type?** No. It is an existing immutable artifact: exact bytes, a
SHA-256 digest, and a recorded origin. It can be a test-owned file or patch, a content-addressed snapshot, or
an external asset already associated with the project. What it cannot be is a claim that the Work ran on a
basis it did not run on.

**What existing authority permits its effects?**

| effect | authority |
| --- | --- |
| creating the intake task | the operator's plan revision (`planReconciled`), which requires quiescence and records a `PROJECT_REVISED` + `TASK_CREATED` |
| running the worker | the canonical `TaskEnvelope` and the D2-d delegation kernel |
| completing the attempt | the completion contract's observed evidence (write scope, required artifacts, applicable command) |
| promoting the result | `PromotionManager.promote()` with an operator-supplied, canonically validated source commit and expected head |
| advancing the head | head reconciliation over the committed promotion fact, after quiescence |

**Is the real execution basis provable?** Yes:

- the envelope's `base_commit` is H0;
- the execution world is materialized at H0 (`src/deployment/execution_world.ts`);
- the result commit's parent is H0 (the worker commits in that world);
- the promotion's `expected_head_commit` is the canonical expected head H0;
- the promotion fact records `sourceCommit = resultCommit`, `expectedHeadCommit = H0`,
  `resultingHeadCommit = H1`;
- the next attempt's envelope base is H1 after reconciliation.

Each identity is recorded separately. A result commit is **not** assumed to equal the resulting promotion head:
the promotion fact records both, and the head reconciliation consumes the resulting head.

**Does the product execute after accepted intake?** The chain is mechanically available: promotion →
`SYNC_REQUIRED` → quiescence → `reconcileProjectHead` → `planReconciled` with `headAdvance` → reauthorized
`READY` tasks → D2 prepare on the new base. C5-C exercises it end to end.

### B3 — new External Source Admission Authority

B3 would be a new canonical authority that accepts an external source revision directly, without a Work
result and Promotion. It is **not required** for the Git-source intake route above. It would be required only
if the product must adopt an external Git commit as project truth without an operator-authored Work task and
an operator promotion.

B3 is outside COG-5's default scope and is not implemented. No new head database, source-intake service or
second promotion ledger is created.

---

## 3. Authority controls, and how the B2 route satisfies them

| control | how B2 satisfies it |
| --- | --- |
| **Unauthorized change** | A direct external commit moves only live HEAD. ProjectIR stays at H0; `prepareMutatingWork` refuses `HEAD_BASIS_MISMATCH`. No automatic adoption. |
| **Changed candidate** | Approval binds to the exact result commit, not to a mutable file name. A later modified candidate has different bytes and requires a new task, result and promotion; the original promotion cannot authorize it. The promoted tree's digest is checked against the recorded candidate digest. |
| **Duplicate delivery** | Repeating the same task/promotion converges on the same `promotionId` and terminal `PROMOTION_COMMITTED`; duplicate promotion returns the same event with no second effect. |
| **Concurrent movement** | If the canonical expected head moves before the intake result is promoted, `PromotionManager` validates the caller's expected head against the canonical chain and refuses (`caller_head_not_canonical` / `cross_revision_promotion_not_supported`). The result stays unpromoted. |
| **Unapproved paths** | The completion contract's `assert_write_scope` compares the observed diff against the envelope's `write_paths`; an out-of-scope change fails and records no passing atom. |
| **Unrelated live commits** | Being ahead of the canonical head grants no authority. The D2 guard refuses until a proven promotion and reconciliation establish the new basis. |
| **Failure before acceptance** | A failed worker, missing completion evidence, or rejected promotion cannot become a canonical source update; the result stays an unpromoted candidate. |
| **Approval boundaries** | The worker cannot promote, mint a permit or revise the plan. A model cannot grant itself operator or Project Intent admission authority. The normal host supplies no `projectIntentAdmission`. |

---

## 4. Stale, duplicated and rejected updates

| case | observable outcome |
| --- | --- |
| **stale** — the canonical basis moved before the intake result is promoted | promotion eligibility blocks with `cross_revision_promotion_not_supported` (same-base topology) or the promotion head check refuses; the result remains unpromoted |
| **stale** — the external commit moved live HEAD without a promotion | D2 `prepareMutatingWork` refuses `HEAD_BASIS_MISMATCH`; `reconcileProjectHead` does not adopt the ambient head |
| **duplicate** | the promotion identity is derived from the attempt, so a replay converges on the same `PROMOTION_COMMITTED`; no duplicate canonical effect |
| **rejected** — the operator declines the candidate or the completion fails | no `ATTEMPT_RESULT`, no promotion, no head movement; the rejected candidate remains an external fact, not project truth |
| **rejected** — the promotion fails deterministically | `PROMOTION_FAILED` (or the external-divergence error), no `PROMOTION_COMMITTED`; the head stays where it was |

---

## 5. Is the design reusable for non-Git external assets?

The **pattern** is reusable:

```text
immutable external artifact (bytes + digest + origin)
  → operator-authorized Work task with an exact write scope
  → isolated execution world
  → observed completion
  → ATTEMPT_RESULT
  → operator promotion
  → canonical head advance
```

The **current canonical source facet is Git-specific**. The basis's source binding is a Git backend revision;
the change observer runs `git diff --name-status`; the promotion effect merges a Git commit; the head is a Git
commit. A non-Git asset could participate as a Work **asset** facet (the `asset` selector domain exists), but
no canonical envelope field declares an asset dependency yet, and no first-party asset observer is composed.
Generalizing the intake route to non-Git assets would therefore require an asset/source backend decision — not
a new admission authority, but a real product decision about what a canonical source is.

For COG-5 the route is **intrinsically Git-specific at the canonical-source layer**, while the
authority pattern (operator task + observed result + promotion) is general.

---

## 6. Decision

1. **B1 is insufficient for adoption.** External assets can be cited and journaled; they cannot move the
   canonical head. That is correct and is preserved.
2. **B2 is the lawful route.** An operator-authored Work task applies an immutable, externally identified
   candidate in an isolated world; the completion contract observes the result; normal operator Promotion
   advances the proven effect head; head reconciliation reauthorizes the next work onto the new basis.
3. **B3 is not necessary and is not implemented.** No new authority root, head database, source-intake service
   or second promotion ledger is created.
4. **The D2 `HEAD_BASIS_MISMATCH` guard is preserved.** The positive path becomes possible because the project
   authority is legitimately updated, not because the guard is weakened.
5. **The candidate is provenance, not approval.** The source's Git identity, branch name or author never grants
   authority. Only the operator's plan revision and promotion do.
6. **The route is Git-specific at the canonical-source layer.** Non-Git external assets need a separate
   asset/source-backend decision; the authority pattern is reusable.
7. C5-B exercises B2 in a test-owned world with a deterministic worker, and preserves the direct
   external-commit divergence as a negative control. C5-C then exercises the joined continuation on the
   resulting canonical basis.
