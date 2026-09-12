# G10-D2 — Contract Coverage Matrix

| Proof / invariant | Code face | Machine test | Status |
| --- | --- | --- | --- |
| D2-M01 ephemeral requires no PersistentPoint | service path has no store dependency | no-store realization test | implemented + machine-tested |
| D2-M02 carrier effect passes through Ordarium | `effects.invoke` + idempotent actions on the shared ledger | duplicate-realize dedupe (port called once) | implemented + machine-tested |
| D2-M03 direct port mutation path absent | port reachable only inside action `execute` | static audit on `realize.ts` | implemented + machine-tested |
| D2-M04 success → Activation + RuntimeAttachment | materialize after effect | realization-shape test | implemented + machine-tested |
| D2-M05 failed effect → no Activation artifact | failed outcome, no realizations | port-failure test | implemented + machine-tested |
| D2-M06 RuntimeAgentRef stays host identity | refs carried verbatim from the port result | verbatim-identity test | implemented + machine-tested |
| D2-M07 SessionRef not synthesized | `session` only when the host returned one | absent-session test | implemented + machine-tested |
| D2-M08 retries use the stable realization key | key in every action input; allocator-stability contract | retry-dedupe test | implemented + machine-tested |
| D2-M09 install works without a runtime port | `install.ts` untouched in D2 | source audit + full suite green | preserved |
| D2-M10 port config does not change Work planning | no planning changes | full suite green | preserved |
| D2-M11 scheduler untouched/pure | `src/scheduler` no-diff | scheduler suite green | preserved |
| D2-M12 no Attempt identity inferred | no attempt/task fields in inputs or outputs | static + structural audits | implemented + machine-tested |
| §45 crash boundary | port idempotency contract documented; exactly-once not claimed | Effect-Authority record | documented |
| §105 failure semantics | realized / refused{plan_stale, persistent_selection} / failed{runtime_realization_failed, effect_denied} | refusal + failure tests | implemented + machine-tested |
| §107 idempotency | stable allocator contract + Ordarium dedupe + idempotent release | double-realize + double-release tests | implemented + machine-tested |

## Non-goals held

No PersistentPoint work (D3); no observation port (D4); no install wiring
(D5); no event/storage changes; frozen contracts and B3 kernel untouched;
`agent?: unknown` never inspected.
