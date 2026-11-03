# S09 — User acceptance script (no private API, no SQLite queries)

This is the shortest ordinary-user path. It assumes the repository is built (`pnpm run build`).

## 1. Doctor

```bash
node dist/src/cli.js doctor --repo=/path/to/your/repo --state=/path/to/your/repo/.palimpsest/state
```

Expect JSON with `schema: "pc1-doctor/v1"`, `liveModel: "BLOCKED"` when no spend authorization is
configured, and no credential value anywhere. Windows will report the write-confinement sandbox
warning; that is the measured limit, not a failure.

## 2. First entry

```bash
node dist/src/cli.js init \
  --repo=/path/to/your/repo \
  --project=my-project \
  --goal="Produce the reviewed deliverable" \
  --profile-file=/path/to/your/repo/.palimpsest/state/product-profile.json \
  --operator=operator:alice \
  --operator-purpose="review project changes"
```

`init` creates the state databases, the journal/association/review stores and a non-secret product
profile. It starts the project only when `--goal` is given and no project exists.

## 3. Continue / inspect

```bash
node dist/src/cli.js continue --profile-file=.../product-profile.json
node dist/src/cli.js context-capsule --profile-file=.../product-profile.json --max-bytes=4096
```

The summary separates accepted-for-purpose facts, delivered candidates, negative findings, open
questions, pending work, blocked effects and authority boundaries. The capsule names omitted sections
when the budget is tight.

## 4. Review

The agent records a proposal through `palimpsest_work action=propose` (journal) or the operator can
create a structured plan proposal:

```bash
node dist/src/cli.js review propose-plan --file=plan.json --profile-file=.../product-profile.json
node dist/src/cli.js review list --profile-file=.../product-profile.json
node dist/src/cli.js review preview <proposalId> --profile-file=.../product-profile.json
node dist/src/cli.js review approve <proposalId> --actor=operator:alice --profile-file=.../product-profile.json
node dist/src/cli.js review apply <proposalId> --actor=operator:alice --profile-file=.../product-profile.json
```

`plan.json` shape:

```json
{
  "purpose": "add the follow-up",
  "proposedAction": "revise the plan",
  "sources": ["journal:..."],
  "writePaths": ["next.md"],
  "effects": ["projectir_revision"],
  "reason": "the next step",
  "tasks": [
    { "task_id": "deliver", "objective": "...", "depends_on": [], "write_paths": ["deliverable.md"], "required_artifacts": ["deliverable.md"] },
    { "task_id": "next", "objective": "...", "depends_on": ["deliver"], "write_paths": ["next.md"], "required_artifacts": ["next.md"] }
  ]
}
```

A decision without the configured operator is refused, with a non-zero exit.

## 5. Outcomes

```bash
node dist/src/cli.js outcomes contracts --profile-file=.../product-profile.json
node dist/src/cli.js outcomes evaluate --task=deliver --contract=json-artifact --artifact=plan.json '--params={"requiredKeys":["sites"]}' --profile-file=.../product-profile.json
node dist/src/cli.js outcomes project --profile-file=.../product-profile.json
```

A negative investigation returns `infeasible` with unmet requirements; it never becomes
`supported`.

## 6. Recovery

```bash
node dist/src/cli.js recover --profile-file=.../product-profile.json
```

It calls the existing `PromotionManager.reconcileAll()` and the canonical head reconciliation. A
blocked report is truthful; it does not fabricate a terminal effect.

## 7. Scenario acceptance (deterministic)

```bash
node scripts/pc1/acceptance.mjs
```

This stages Sablewick and field-study P/F pairs, checks T1/T2 visibility and equivalence, and records
that the live runner is BLOCKED without a spend authorization. It makes no model call.
