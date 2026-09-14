# G10-R Empirical Evidence

Reproduce (after `pnpm run build`):

```bash
node scripts/experiments/run-campaign.mjs
# artifacts (gitignored): .dogfood/g10r-om.sqlite · g10r-campaign-summary.json · g10r-bundle.json · campaign.log
```

Host: DSH 0.1.5-rc.2, real model. Ordarium v1.3.1. Palimpsest SHA `bdb935b…` (campaign ran on the R worktree).
RunPolicy `minRunsPerVariantPerScenario = 3`, seeded order (seed 20260914), `maxAttemptsPerRun = 1`.

## Runs

```text
realCompleted 11 · realFailed 1 · scripted 6 · total 18   (elapsed ~9.8 min)
token metrics: inputTokens/outputTokens/cacheReadTokens/reasoningTokens known=12 unavailable=6
               cacheWriteTokens unavailable=18   estimatedCost ALWAYS unavailable (host exposes no dollar cost)
retained failure: exp-federation / var-single-locus / orderIndex 1 → FAIL/TIMEOUT (validator: report.json not produced)
```

## Golden A — Anti-agentification (real DSH, n=3 per variant, SCAFFOLDED)

| metric (median) | SINGLE_LOCUS | ARTIFICIAL_ROLE_SPLIT |
| --- | ---: | ---: |
| qualityScore | 100 | 100 |
| wallClockLatencyMs | 13 459 | 24 241 |
| agentTurns | 1 | 3 |
| agentSteps | 4 | 8 |
| toolCalls | 3 | 6 |
| inputTokens | 1 404 | 2 535 |
| outputTokens | 782 | 1 092 |
| cacheReadTokens | 39 040 | 76 672 |
| reasoningTokens | 119 | 423 |
| coordinationProxyCalls | 0 | 4 |
| crossPeerMessagesProxy | 0 | 1 |

**Pareto frontier: {SINGLE_LOCUS}** — equal measured quality with ~80 % more latency, ~3× input tokens,
double the tool calls and 4 coordination-proxy calls for the role split. Under this scenario and model,
the artificial boundary was pure overhead. `qualityScore` came from a deterministic artifact validator.

## Golden B — Genuine Federation (real DSH, n=3 per variant, SCAFFOLDED)

| metric (median) | SINGLE_LOCUS (all context) | FEDERATED_PEERS |
| --- | ---: | ---: |
| qualityScore | 100 (2 runs) | 100 (3 runs) |
| wallClockLatencyMs | 57 290 | 42 507 |
| agentTurns | 1 | 6 |
| agentSteps | 11 | 23 |
| toolCalls | 17 | 18 |
| inputTokens | 10 328 | 7 489 |
| outputTokens | 4 637 | 4 856 |
| cacheReadTokens | 170 880 | 255 104 |
| reasoningTokens | 1 857 | 2 239 |
| attentionActivations | 0 | 4 |
| crossPeerMessagesProxy | 0 | 6 |
| coordinationProxyCalls | 0 | 18 |
| outcomes | 2 PASS, 1 TIMEOUT | 3 PASS |

**Pareto frontier: {FEDERATED_PEERS, SINGLE_LOCUS} — no domination.** Federation traded more turns,
tokens and coordination for lower median wall-clock latency, and its runs all completed while one
single-locus run timed out. Under scenario set {interface negotiation}, model M, this is an observed
association, **not** a universal ranking.

## Golden C — ReasoningCell (SCRIPTED_MECHANICAL, n=3 per variant, no LLM)

| metric (median) | SINGLE_LOCUS | REASONING_CELL |
| --- | ---: | ---: |
| branches | 5 | 7 |
| duplicateClaims | 0 | 1 |
| unresolvedRate (%) | 20 | 0 |
| verificationOverhead | 0 | 3 |
| coordinationProxyCalls | 0 | 3 |

**Pareto frontier: {SINGLE_LOCUS}** on the measured objective set; the reasoning cell shows a lower
unresolved rate but higher duplicate/verification/coordination overhead. `qualityScore` was
`unavailable` (no deterministic validator for this scripted scenario) and is therefore omitted from
the Pareto rather than scored 0.

## Failure distribution

```text
FAIL/TIMEOUT     1   (exp-federation / var-single-locus / orderIndex 1, retained, not retried)
validator ERROR   0
authority/host    0
```

## Rules honoured

Failures retained (not retried to success); unavailable ≠ 0; distributions (count/known/unavailable, mean,
median, min/max, variance, quantiles) rather than point estimates; paired median deltas by shared
`orderIndex`; Pareto instead of ranking; no universal score; scaffolded scenarios disclosed in every
run's provenance and in evaluation warnings; all metrics labelled `proxy` where they are proxies.

## Interpretation (required form)

> Under scenario set {anti-agentification, interface negotiation, reasoning decomposition} and model M,
> the artificial role split was associated with higher latency, tokens and coordination at equal
> measured quality; federated peers and a single locus with all context were non-dominated on the
> interface-negotiation scenario; and the reasoning cell showed lower unresolvedness at higher
> verification/coordination overhead.

No claim is made that any architecture is universally better, and none of these observations grants
authority to change the organization.
