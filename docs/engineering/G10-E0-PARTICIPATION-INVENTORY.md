# G10-E0 — Participation Inventory

Inventory performed on canonical main (post-D-AUTH closure) by reading source.

## 1. The seams (§17)

| Seam | Location | What it owns today |
| --- | --- | --- |
| Attempt identity source | orchestration ledger (`attempt` entities, `attempt_id` from `TaskSpec.task_id` + attempt counters via `stableEntityId`) | Work/Attempt canonical identity |
| Attempt canonical projection | `src/state/` projector (attempt rows, attempt report tables) | Work attempt state |
| Activation artifact | `src/runtime/identity.ts` (G10-D1) — in-process semantic state | runtime activation identity (activationId, agentDefinitionId, runDefinition/bindingResolution refs) |
| RuntimeAttachment | `src/runtime/identity.ts` — materialized after effect success | which carrier realizes the activation now |
| ProjectController claim path | `src/tools/controller.ts` (`claim`/dispatch around `TaskEnvelope`) | Work claim/dispatch |
| AttemptExecutor / ClaimReportExecutor / CommandExecutor | `src/effects/executor.ts` | Attempt execution — untouched by G10-D |
| DshToolRunContext | `src/tools/dsh_types.ts` — `agent?: unknown` unconsumable | no trustworthy runtime-agent identity |
| runtime high-level service | `installed.runtime` (G10-D5) — observe/compile/realize/release | realization only; no participation concept |
| EventStore | `src/state/database.ts` | Work orchestration truth |
| possible coordination-store location | none exists yet | — |

## 2. The decisive question (§17)

> Can an Activation currently be authoritatively inferred to participate in
> an Attempt?

**NO.** There is no shared identity, no recorded relation, and no inference
rule that would make such a claim authoritative. Attempt execution proceeds
with no Activation; Activations exist with no Attempt; neither side records
anything about the other.

## 3. Participation rule (§18) — frozen for this campaign

```text
Participation is EXPLICITLY recorded.

It is never inferred merely because:
- an Attempt exists
- an Activation exists
- the same user triggered both
- the same worktree is used
- task and agent labels match
- the DSH agent object looks similar
```

The relation is realized in E1 through explicit `Invocation` /
`Participation` artifacts on the coordination store, with cardinality
left open (one Activation may participate in multiple Attempts; one Attempt
may have multiple Participations; Participation ≠ ownership).
