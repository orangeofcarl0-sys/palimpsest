# G10-X — Multi-Promotion Evidence

Artifact: `scripts/management/multi-promotion.mjs` → `.dogfood/g10x-multi-promotion.json`.
Baseline: `main @ f639181199da9ccd7acb3fac2c46392e0b82eb04`. Result: **PASS**, 36/36 checks.

## What ran

A real `installPalimpsest` stack over real SQLite files under `.dogfood/g10x/` — real
`ProjectController` + `SqliteProjectWorkspaceService` + real Ordarium effects + `FakeGitPort` —
driven through two sequential execute → verify → promote → head-sync cycles. The harness names the
attempt only; it never supplies a source commit or an expected head.

```
rev0 / H0, tasks A → B
cycle 1: A claim → commit → report → verify → PROMOTE → A SATISFIED  (H0 → H1)
         head drift observed (projectHead H0, provenHead H1, SYNC_REQUIRED)
         reconcileProjectHead() → reconciled, rev1 / head H1, B re-authorized on H1
cycle 2: B claim → commit → report → verify → PROMOTE → B SATISFIED  (H1 → H2)
         head drift observed (projectHead H1, provenHead H2, SYNC_REQUIRED)
         reconcileProjectHead() → reconciled, rev2 / head H2
final:   terminal; ProjectIR head === git head === proven head (H2)
```

## Head evolution

| Field | Value |
| --- | --- |
| `h0` (genesis) | `cccccccccccccccccccccccccccccccccccccccc` |
| `h1` (after A) | `0000000000000000000000000000000000000002` |
| `h2` (after B) | `0000000000000000000000000000000000000004` |
| `finalIrHead` | `0000000000000000000000000000000000000004` |
| `finalGitHead` | `0000000000000000000000000000000000000004` |
| `finalProvenHead` | `0000000000000000000000000000000000000004` |
| `irEqualsGit` | `true` |
| `revision` | 0 → 2 (digest `dba17101…`) |

## Promotion derivation (no caller commits)

| Cycle | Task | Base before | Report commit | Promotion `source_commit` | Promotion `expected_head` | Resulting head |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `task-a` | `cccc…` (H0) | `0000…0001` | `0000…0001` | `cccc…` (H0) | `0000…0002` (H1) |
| 2 | `task-b` | `0000…0002` (H1) | `0000…0003` | `0000…0003` | `0000…0002` (H1) | `0000…0004` (H2) |

The promotion source in each cycle **equals the attempt report's `result_commit`**, and the expected
head equals the canonical proven head at call time (`canonicalExpectedHead()`). The envelope bases
are `task-a: cccc…` (H0) and `task-b: 0000…0002` (H1 after the first sync) — H0 → H2 in two cycles.

## Real DSH principal

`dshPrincipal: true`. A real DSH host process booted over a deployment profile wiring the same
project/management stores; it emitted exactly one `PALIMPSEST_HOST_READY` line, one `localPeer`
(`peer-g10x-project`), one `PersistentPoint` (`pp-g10x-project`), and read over its own HTTP
surface:

- `workspace.project.revision === 2`;
- `workspace.project.headCommit === 0000…0004` (equal to the proven repository head);
- `workspace.project.head.state === "IN_SYNC"`;
- both tasks `SATISFIED`.

## Honesty

- `dshAttempt: false`. A live DSH attempt execution is not possible over the host's HTTP surface
  (no remote claim/report/gate channel; a headless DSH session cannot drive the Work tools without a
  model). The attempts run on the real scheduler/controller/Ordarium path against the SAME SQLite
  deployment the host reads. Nothing is faked.
- The git port is `FakeGitPort`, so the commit ids are synthetic; the *derivation* being proven
  (source = report commit, expected = proven head, IR head follows) is the real controller path.
- The evidence file is a derived operational record, not a canonical truth.
