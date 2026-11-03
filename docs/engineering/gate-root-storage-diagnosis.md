# `.palimpsest-gates` — storage pressure diagnosis

**Measured on this host, 2026-10-22.** Every number below comes from an executed measurement, not an estimate.

---

## 1. The symptom

`C:` reached **0 bytes free** twice during Host-S1R. It presented as `ENOSPC` from vitest, suites reporting
`NOT_RUN`, `fork: Resource temporarily unavailable`, and a `git worktree add` failing halfway through a checkout.

The gate root `~/.palimpsest-gates` held **18.76 GiB across 61 entries**, with single entries holding up to
**112,519 files**.

---

## 2. Two independent causes

### Cause A — every test home materialises a full copy of the runtime dependency tree

`scripts/trajectory_p2b/rig.mjs` exports:

```js
export function linkSharedModules(home) {
  const target = join(home, "profiles", "node_modules");
  for (const entry of readdirSync(REAL_MODULES)) {
    cpSync(source, destination, { recursive: true, dereference: true });   // <-- COPY, not link
  }
}
```

The name says "link". The implementation **deep-copies**. `dereference: true` follows the installer's junctions,
so a tree that occupies **0.4 MiB / 22 files** on disk expands to **1,048.6 MiB / 112,512 files** per home.

Measured cost of one call:

| Strategy | Elapsed | Physical bytes | Physical files |
|---|---|---|---|
| `cpSync(..., { dereference: true })` | **124 s** | **1,048.6 MiB** | **112,512** |
| junction per top-level entry | **0.068 s** | **0 MiB** | **0** |

The dominant term is `@deepseek-ai/dsh/node_modules` — 461 MiB and 26,621 files, a nested dependency tree that
only exists because dereferencing expands it.

Gates that create **two** homes per run therefore spend **~2.1 GiB and ~4 minutes** on module plumbing alone:

- `scripts/trajectory_p2b/rig.mjs` → `linkSharedModules`
- `scripts/trajectory_p2b/level-b-first-party-gate.mjs` → a second, duplicated `linkSharedModules`
- `scripts/trajectory_p2d2/l2-gate.mjs` → inline copy in `makeProfile`
- used by `canonical-correlation-gate`, `cold-recovery-gate`, `cold-preview-gate`, `cold-capsule-gate`,
  `real-integration-gate`

**This is already solved elsewhere.** `scripts/trajectory_p2e0/dsh-test-home.mjs` has `shareDshModules`, which
defaults to per-entry junctions, falls back to a *preflighted* copy only if a junction fails, and reports which
strategy ran. Every P2-E gate uses it. The P2-B/P2-C/P2-D gates predate it and never migrated.

### Cause B — the roots are not reclaimed on most exit paths

`safeCleanup(owned)` is called exactly **once** per gate, at the end of the happy path. But each gate has many
earlier exits, and `finish()` calls `process.exit()` immediately:

| Gate | `finish()` call sites | `await safeCleanup` |
|---|---|---|
| `canonical-correlation-gate` | 5 | 1 |
| `cold-recovery-gate` | 7 | 1 |
| `cold-preview-gate` | 10 | 1 |
| `cold-capsule-gate` | 10 | 1 |
| `real-integration-gate` | 10 | 1 |
| `l2-gate` | 10 | **0** |

`l2-gate.mjs` never cleans up at all: it allocates with `mkdtempSync` and has no `safeCleanup`, no `rmSync` of
`owned.root`, and no `finally`. Its entry `p2d2-l2-ZoqTim` is the largest single leak at 1,299 MiB / 99,794 files.

So a run that fails — or that hits `BLOCKED` because `dist/` is stale — leaks the entire root, including the
~1 GiB copy from Cause A. **Failure is the common case**, which is why the leaks accumulated to 18.76 GiB.

---

## 3. What is NOT the cause (measured, and previously mis-stated)

An earlier commit (`414d84d`) claimed that `rmSync(..., { recursive: true })` follows a directory junction and
therefore deleted the repository's `node_modules`. **That claim is false on this host.** Measured:

| Operation on a directory containing a junction | Target survives? |
|---|---|
| `rmSync(home, { recursive: true, force: true })` | **yes** — target intact |
| `rm -rf home` (Git Bash) | **yes** — target intact |
| `git clean -fdx` | **yes** — target intact |
| `rmdir junction` | **yes** — link removed, target intact |

The `node_modules` damage during Host-S1R was **not** caused by junction-following deletion. The evidence points
to the `cpSync(..., { dereference: true })` path: the parent worktree's `node_modules` was a junction to the
repository's modules, and a dereferencing copy into it writes *through* the link into the target. A copy
**reads** the target and **writes** at the destination path; when the destination is itself a junction, the
write lands in the target.

This distinction matters for the fix: **junction-based homes are safe to delete**, which is what makes Cause A
fixable at all.

---

## 4. Why the default root is on `C:`

`scripts/gates/env.mjs` documents it: the PTC sandbox grants a worker's write capability with
`SetNamedSecurityInfoW`, which needs `WRITE_DAC`. Measured on this machine, the user holds FullControl inside
their own profile but only Modify on `F:`/`E:`/`C:\`. A fixture outside the profile therefore fails with
`Win32 5` for a reason unrelated to Palimpsest.

I confirmed the same constraint independently during Host-S1R: label writes return `5` on `F:` and succeed under
the profile, and granting `(OI)(CI)F` on a test-owned `F:` directory makes them succeed.

So **moving the gate root off `C:` is not a fix by itself** — it must remain somewhere the user has WRITE_DAC,
or the gates stop working. The fix must reduce the bytes, not just relocate them.

---

## 5. What a correct fix has to do

1. **Stop copying.** Use junctions for the shared runtime tree, as the P2-E helper already does. That removes
   ~1,048 MiB and ~124 s per home.
2. **Reclaim on every exit path**, including failure, `BLOCKED`, and `SIGINT` — not only the happy path.
3. **Bound the total.** A per-run ceiling and a reaper for abandoned roots, so a future leak cannot reach 18 GiB
   unnoticed.
4. **Preserve the safety properties** the existing helper already established: containment proof, reparse check,
   never delete an unowned directory, and report which strategy actually ran.
5. **Keep the gates working.** A fix that makes `dist`-stale runs refuse to start is acceptable; one that makes a
   legitimate run fail is not.

---

## 6. Reclaimable now

The 48 `p2*` entries account for 19,194 MiB of the 18.76 GiB total. The twelve `*-live` entries are ~1 MiB each
and are the acceptance-gate outputs that later stages cite, so they should be kept.

Removal must be verified: each `p2*` entry is a test-owned directory under the gate root, none is a reparse
point, and none contains a path outside the root. That check is part of the fix, not a manual step.
