# G10-AA — Delivery report

Stage: **Trusted Promotion Outcome Admission & Terminal-Fact Integrity**.
Baseline: `orangeofcarl0-sys/palimpsest` `main @ 0164aab755a1372e4f1c81e391c2fd2f73a661f3`.
Closes **CF-Z-02**.

## 1. What changed

**New — `src/domain/promotion_terminal.ts`** (pure): the terminal lifecycle types
and rules. `PROMOTION_TERMINAL_TYPES`, `PROMOTION_OUTCOME_KINDS`,
`PROMOTION_INTENT_BASES`, `PROMOTION_OUTCOME_BASES`, `preparedBasisOf`, and
`promotionTerminalProblems` - the single definition of a terminal's structural
legality against its admitted intent.

**New — `src/domain/promotion_terminal_admission.ts`**: the two opaque, one-shot
capabilities (`PromotionIntentPermit`, `PromotionOutcomeWitness`), a
module-private live registry, `consumePromotionIntentPermit` /
`consumePromotionOutcomeWitness`, `PromotionAdmissionError`, and the
`PromotionGovernedAdmission` context. `new` is unavailable outside the module; a
plain object and a structural copy of a real instance are both refused.

**`src/domain/aggregate.ts`** — Plane A: `#validatePromotionTerminal` (replay-safe,
projection-based lifecycle). Plane B: `validateAdmission` now requires the intent
permit for `PROMOTION_PREPARED` and the outcome witness for terminals, via an
optional admission context that only the narrow store methods supply.

**`src/state/event_store.ts`** — `appendPromotionIntent(request, permit)` and
`appendPromotionTerminal(request, witness)`, plus threading the admission context
through `#appendInTransaction` to `validateAdmission`. The generic `append` and
`appendAtomic` therefore deny promotion facts.

**`src/effects/promotion.ts`** — every terminal call site now declares its real
outcome basis; `#appendTerminal` mints the witness from the deterministic Ordarium
operation identity (`operationIdentityPreview`, no second algorithm) plus an input
digest, and records optional provenance; `#appendPrepared` mints the intent permit.

**`src/schema/models.ts`** — optional `operation_id`, `outcome_basis`,
`outcome_digest` on terminal payloads, allowlisted and normalized only when
present.

**`src/tools/controller.ts`** — `invalidateTask` now applies Z's promotion fence
(a gap found during AA0; the method had no production callers).

## 2. Delivered admission

```text
generic append(PROMOTION_PREPARED|COMMITTED|FAILED)  → denied (no capability)
appendPromotionIntent(event, permit)                 → structural + permit → append
appendPromotionTerminal(event, witness)              → structural + witness → append
```

with the structural plane running identically during live append, `verifyFull()`
and `rebuildProjections()`, and the capability plane running only for a new
append.

## 3. Behaviour comparison with the baseline

| | Baseline `0164aab` | G10-AA |
| --- | --- | --- |
| `append(PROMOTION_COMMITTED)` with an invented head | accepted; proven effect head moved | denied |
| `append(PROMOTION_FAILED)` over a real fence | accepted; fence released, Work retired | denied |
| `append(PROMOTION_PREPARED)` | accepted; fake fence created | denied |
| Terminal validation | none | structural lifecycle, replay-safe |
| Effect-outcome provenance | none | optional `operation_id` / `outcome_basis` / `outcome_digest` |
| Capability forgery | n/a | plain object and structural copy both refused |
| `invalidateTask` across an unresolved effect | allowed | fenced |
| Replay | unchanged | unchanged, and proven offline with a closed effects runtime |
| New event type / migration / table | — | none |

## 4. Proof

**Reproductions** (`scripts/audit/aa0-terminal-ingestion-repro.mjs`): forged
COMMITTED moved the canonical head (`cc…cc → …09`); forged FAILED released a real
fence and let a revision retire Work whose merge had already landed; fabricated
PREPARED created a fake fence. All three now `REJECTED`.

**Suites**: `test/aa_terminal_admission.test.ts` (16) and
`test/aa_adversarial.test.ts` (16, `AA-N01`…`AA-N30` plus explicit fake-PREPARED
tests).

**Corrected existing tests**: the two Z tests that fabricated a legacy PREPARED
through the generic `store.append` (the hole AA closes) now assert the stronger
guarantee instead - every supported retirement path is refused while an intent is
unresolved, which makes recovery's authority re-check defence in depth rather than
a reachable branch.

## 5. Local gates

```text
git diff --check                      clean
pnpm build                            clean
pnpm exec vitest run                  153 files / 1454 tests passed
pnpm run build:web                    ok (203 modules)
pnpm exec playwright test             27 passed
aa0-…repro.mjs                        all three scenarios CLOSED
```

Baseline was 151 files / 1422 tests.

## 6. Deviations and honest limitations

* **Trust boundary.** AA defends the protocol against generic/plugin/accidental
  writers; it does not defend against same-process malicious code that imports the
  admission module, nor against DB/process-memory tampering. Stated in the
  doctrine doc and the anti-waste audit.
* **`CF-AA-01`**: the `deterministic_failure`, `denied`, `cancelled` and
  `authority_revoked_before_dispatch` bases are wired and their terminal admission
  is proven positively, but the branches are **not reachable** through the current
  engine contract (a provider error becomes uncertainty; authorization always
  allows). No test previously produced a `PROMOTION_FAILED` at all.
* **Provenance is a SHOULD and an audit aid**, not a proof: the governed manager
  writes it, and a within-boundary hand-built terminal may omit it (asserted
  explicitly in the FAILED-admission test).
* **The structural rule requires a PREPARED.** Compatible with all canonical
  history and fixtures (none contains a terminal without one); a hypothetical
  orphan-terminal legacy log would not replay, and none exists here.
* **A Z-fence gap was closed** (`invalidateTask`), which is a behaviour change for
  a method with no production callers. Recorded as `CF-AA-03`.

## 7. Canonical checkpoint

Recorded after merge.

```text
baseline                        0164aab755a1372e4f1c81e391c2fd2f73a661f3
implementation commit           3d05ae41932d51efeffc4605f30887cdb50ced1b
  "feat(g10-aa): trusted promotion outcome admission & terminal-fact integrity"
pull request                    #95  experiment/g10-aa-outcome-admission -> main
PR checks                       run 35015447381  attempt 1  e2e pass / unit pass
merged commit (canonical main)  751609447e17fab269b25c04720c75ed9ebc416a
  "Merge pull request #95 from orangeofcarl0-sys/experiment/g10-aa-outcome-admission"
tree identity                   git diff 3d05ae4 7516094  ->  EMPTY (identical trees)
canonical main run              35015616408  attempt 1  conclusion: success
```

All remote runs concluded green on **attempt 1**; no rerun was required.

### Reproducing the local gate

```bash
pnpm install
pnpm build
pnpm exec vitest run                      # 153 files / 1454 tests
pnpm run build:web
pnpm exec playwright test                 # 27 passed
node scripts/audit/aa0-terminal-ingestion-repro.mjs
#   A -> CLOSED_GENERIC_TERMINAL_DENIED   (forged COMMITTED)
#   B -> CLOSED_GENERIC_TERMINAL_DENIED   (forged FAILED)
#   C -> CLOSED_GENERIC_INTENT_DENIED     (fabricated PREPARED)
```
