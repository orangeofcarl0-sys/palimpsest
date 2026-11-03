# S00 — Baseline dossier (PALIMPSEST-PC1)

Recorded 2026-11-02 before any executable change in this programme. All values were read from the local clone; the pack's GitHub-observed values are recorded separately and are not treated as current without a local check.

## 1. Repository identity

| Fact | Value |
|---|---|
| Repository | `F:\Codex_Work_Space\Palimpsest\palimpsest-sr1` |
| Remote | `https://github.com/orangeofcarl0-sys/palimpsest.git` |
| Source branch | `palimpsest-c6r-behavioral-qualification` |
| Frozen baseline commit | `044b08056a0e98b7d7cee207cb36fb7e453907fe` |
| Baseline tree | `1b7caa156d187e952be8bd90e797f440cb7e2402` (matches the pack) |
| New programme branch | `palimpsest-product-convergence-v1` (created at the baseline, no rewrite) |
| Protected `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b` (unchanged; is an ancestor of HEAD) |
| Divergence from main | 393 commits ahead, 0 behind |
| Working tree at branch creation | clean (0 tracked or untracked changes) |
| Stashes | 0 |
| Local/remote branches | 343 refs visible |
| Worktrees | 95 registered, 2 locked (retained; none removed) |
| Historical rigs | `.cog1-rig`, `.cog4-rig`, `.cog5-rig`, `.cog6-rig`, `.c6r-rig`, probe homes all retained |

Raw evidence: `research-evidence/pc1/s00/git-status.txt`, `worktrees.txt`, `remotes.txt`, `remote-refs.txt`, `stash.txt`.

## 2. Toolchain and installed versions

| Component | Version | Note |
|---|---|---|
| Node | v24.14.1 | package.json wants `>=24.15.0`; pnpm emits an engine warning, build still exits 0 |
| pnpm | 11.21.0 | lockfile-driven install present in `node_modules` |
| Git | 2.53.0.windows.2 | Git Bash host |
| DSH | 0.2.1-rc.3 | `dsh --version` |
| Ordarium | 1.3.1 | `@ordarium/core`, host-kit, ledger-sqlite, testing pinned to release tarballs |
| Palimpsest package | 0.1.2, private | `dist/` build present |

Raw evidence: `research-evidence/pc1/s00/versions.txt`.

The Node engine gap is recorded as a **baseline environment limitation**, not fixed by widening the engine range. The supported product stack for scored work remains the DSH 0.2.1-rc.3 + Linux/WSL2 isolated runtime already qualified by C6-R; Windows is an engineering/verification host only.

## 3. Baseline build and architecture

| Check | Command | Result |
|---|---|---|
| Build | `pnpm run build` | exit 0 (engine warning only) |
| Architecture | `pnpm run architecture:check` | PASS, 0 violations, 9 accepted baseline exceptions |
| Public API | `pnpm run architecture:check-public-api` | not yet run at S00; scheduled in S10 |

Logs: `research-evidence/pc1/s00/build.log`, `architecture-check.log`.

## 4. What was deliberately NOT done

- No reset, stash, rebase, force-push, branch deletion, worktree removal, lock removal, or evidence rewrite.
- No movement of `main`, no PR, no registry publication.
- No model call at S00. The pack's suggested 24M/24-session window is a recommendation, not a spend authorization; `execution-config.json` remains `modelExecution.enabled=false`, `spendAuthorizationRef=null`.
- No deletion of `.cog5-rig` (retained as requested) or any other test-owned rig.

## 5. Historically disputed facts carried forward as hypotheses

The C6-R report's "short resultCommit caused the uncertain promotion" is **not accepted as fact at S00**. The frozen source shows:

- `controller.report` overwrites a caller's `resultCommit` with the observed world HEAD when the world is observable (`src/tools/controller.ts`, report path).
- Event 37 in the C6-R P1 ledger already records the full SHA `f1536b861f57e150f6b5609cc52a0f6d5416907e`, while the reviewer also saw the caller's short `f1536b8`.
- The uncertain Ordarium record says `execution-threw-after-dispatch`, attempts 4; the operator's own notes observed that the canonical repository could not resolve `f1536b8`.

S01 must therefore test, separately: input identity, event identity, object reachability in the canonical ODB, world/path view, and effect-recovery classification. The historical ledger is read-only; any correction is forward-only.

## 6. Programme workspace

The pack is preserved at `docs/programs/pc1/pack/`. Programme tracking lives at `docs/programs/pc1/program-state.json` and `requirement-results.json`. Component evidence lives under `research-evidence/pc1/`.

## 7. S00 exit

- Branch ancestry correct; protected refs unchanged; dirty tree preserved (none existed).
- Capability/owner map and role map written (`S00-OWNER-CAPABILITY-MATRIX.md`, `S00-ROLE-MAP.md`).
- Programme state and requirement matrix initialised.
- Baseline build and architecture recorded.
- Work continues into S01; S00 is not a stop point.
