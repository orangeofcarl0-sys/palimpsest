# COG-2 · evidence namespace

This directory holds the machine-readable record for BGC-0 and COG-2. Everything was produced
read-only with respect to the repository's ordinary resources; the trial worlds live under the
test-owned `.cog2-rig/` and were not part of any production path.

## Governance records (BGC-0)

| file | producer | what it records |
| --- | --- | --- |
| `branch-inventory.json` | `node scripts/bgc0/branch_census.mjs` | every local and remote branch ref with tip, tree, subject, upstream, worktree attachment, ancestry vs the development head and `origin/main`, patch equivalence, freeze-record association, PR history, categories and a proposed disposition |
| `divergence-assessment.json` | derived from the inventory plus per-branch git inspection | the 24 distinct graph-divergent branches grouped by integration status, and the focused `lean-d5d-result-continuation-service` assessment |

## Trial records (COG-2)

| file | what it records |
| --- | --- |
| `runs/*.json` | one record per model session: exact task, exit code, wall clock, tool calls, product calls, token usage (summed from `assistant/message` usage), final visible text, deliverable digest |
| `runs/inheritance-P-round-2-original-reconstructed.json` | the original cold Palimpsest round, reconstructed from its preserved session stream after its `round-2.json` was overwritten by the seam re-test; the original observation (95 calls, 0 product calls, 8 entries, 1066 s) is recorded verbatim |
| `trials/*/plan.md` | the exact delivered plan text for A, B, C, D, CSEAM, F2 and P2SEAM |
| `trials/P-journal-after.json` | the eight journal entries read through the product surface after the P rounds |
| `scores.json` | the pre-registered rubric verdicts with quoted evidence, the observed metrics, and the isolation/limit statements |
| `sessions/<run>/*.zstd` | the raw DSH session streams, copied from the isolated homes; digests in `sessions/manifest.json` |
| `collection.json` | the collector's record: sources, bytes, digests, trial list and session count |
| `collaboration-probe.json` | the AUTO/FOCUS and explicit-PARALLEL capability probe (plan only; no model, no branch) |

## Identities

```text
baseline            c8fe50590d1862840043aff4449f91ec95524c3a  (tree 13623581df2e7b2a19e336e6ef94d55f9dcf9d07)
Code Freeze         e23a29a9d8331da86dad46f3c3ea6070d6319e5c  (tree 2e006507758f67d587f522f31bdf54741020ffa2)
model               deepseek-official/deepseek-flash
runtime             DSH 0.2.1-rc.3
sessions            13
```

The Evidence Freeze commit is not written into its own content.

## What the numbers do and do not prove

- They prove what one model did in one run per condition. They do not prove statistical superiority.
- The raw session streams are the primary record; summaries in `scores.json` are the evaluator's
  reading of the delivered artifacts.
- The session streams contain prompts and model output, no credentials and no real user data.
- The P round-2 plan file itself was overwritten by the seam re-test; its session stream is retained
  and the reconstruction is labelled. No claim about that run depends on the lost file.
- The evaluator was not blinded: same machine, same model family, one scorer.

## Regenerating the governance inventory

From the repository worktree:

```bash
node scripts/bgc0/branch_census.mjs > research-evidence/cog2/branch-inventory.json
```

The producer runs only `rev-parse`, `for-each-ref`, `log`, `rev-list`, `merge-base`, `cherry`,
`worktree list`, `stash list` and `status --porcelain` under `--no-optional-locks`. It writes
nothing; the redirect is the caller's choice.
