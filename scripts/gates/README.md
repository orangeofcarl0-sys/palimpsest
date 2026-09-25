# Live gates

Acceptance evidence for the PLMP-LEAN-1 slices. **Not product components** — the product must not depend on
anything here, and nothing here is imported by `src/**`.

They are in Git because a gate whose harness is lost cannot be re-run, and re-runnability is most of what
makes a gate evidence rather than an anecdote. A fresh `checkout` should be enough to know how to reproduce
a closure claim.

## What is here

| gate | slice | what it proves | assertions |
|---|---|---|---|
| `d2-live-gate.mjs` | §D2-LIVE | real async Work reaches promotion eligibility **without exercising promotion authority** | 15 |
| `d4-live-gate.mjs` | §D4-LIVE | two real workers, two speculative worlds, **serial canonicalization** | 21 |
| `d2-live-tee-worker.mjs` | rig | tee/barrier wrapper for ONE worker (D2) | — |
| `d4-live-tee-worker.mjs` | rig | tee/barrier wrapper for TWO workers (markers derived per world) | — |

Each gate is a VERTICAL test with one golden scenario. Neither re-exhausts the failure taxonomy its slices
already own (`BASE_DRIFT`, `UNCOMMITTED_WORK`, crash windows, duplicate starts, verification FAIL); repeating
those here would only make a longer list.

## Requirements

Measured against the reference run.

| requirement | value |
|---|---|
| Node | v24.14.1 (the package declares `>=24.15.0`; the gate runs on 24.14.1 with a warning) |
| DSH | `0.1.7-rc.2` |
| shell | Git Bash on Windows (the gates use `cmd /c mklink` for the profile junction) |
| credentials | a real `~/.dsh/.credentials.yaml` — **copied, never read by the gate** |
| build | `pnpm run build` first: the gates load `dist/src/**`, not `src/**` |

### Host constraint (the one that actually bites)

DSH's PTC sandbox (`dsh-sandbox-windows-acl`) grants a worker's write capability by calling
`SetNamedSecurityInfoW` on the workspace directory, which needs **`WRITE_DAC`**.

Measured on the reference machine: the user holds `FullControl` inside their own profile but only
`Modify` (inherited, no `WRITE_DAC`) on the `F:`/`E:` volumes and on `C:\`. Every PTC `run_code` therefore
aborts with:

```
SetNamedSecurityInfoW failed (Win32 5): grantWrite(<dir>)
```

This is a property of the **host sandbox**, not of Palimpsest — the product's own contract is that a
PTC-presented worker must **fail closed** rather than silently downgrade, and it did. So the gates place
their fixture inside the user profile by default (`~/.palimpsest-gates`), where the host can actually
provide the sandbox, and what gets measured is the chain rather than this machine's volume ACLs.

If you run elsewhere and the sandbox works, point the gates wherever you like:

```
PALIMPSEST_GATE_ROOT=/some/dir   # fixture, home, state, output
```

## Invocation

```bash
pnpm run build

# §D2-LIVE  (15 assertions)
node scripts/gates/d2-live-gate.mjs

# §D4-LIVE  (21 assertions)
node scripts/gates/d4-live-gate.mjs
```

Both write their full evidence table plus a per-assertion `PASS`/`FAIL` verdict to stdout, and exit
non-zero if any assertion fails. The rig also writes, under `$PALIMPSEST_GATE_ROOT/<gate>/out/`:

- `<attemptId>.transcript.txt` — the worker's own stdout/stderr, including its noncanonical telemetry
  (`PALIMPSEST_WORKER_ENV`, `PALIMPSEST_WORK_RESULT`)
- `<attemptId>.spawned` — written the instant the wrapper starts (the barrier's "it started" half)
- `<attemptId>.barrier` — written by the gate to RELEASE that worker

### Environment

| variable | meaning | default |
|---|---|---|
| `PALIMPSEST_GATE_ROOT` | fixture / home / state / output root | `~/.palimpsest-gates` |
| `PALIMPSEST_GATE_REPO` | the Palimpsest checkout to load `dist/src/**` from | this repository |
| `DSH_HOME` | the real DSH home (credentials, `profiles/node_modules`) | `~/.dsh` |
| `PALIMPSEST_DSH_BIN` | the real DSH entry point to re-exec through the tee wrapper | `$(npm root -g)/@deepseek-ai/dsh/lib/bin.js` |

`env.mjs` resolves all four, refreshes `palimpsest-dsh-host` from `host/dsh/` into the DSH profile loader's
path, and refuses to guess silently: a gate run against a stale host bundle would be measuring a build
nobody shipped.

## Why the barrier instead of a clock

"`start` returned before the work ran" and "two workers were in flight at once" are proven by **parking the
worker processes** until the gate releases them — never by `elapsed < N ms`, which a loaded machine makes
lie. In D4 each marker is derived from the worker's own `process.cwd()` (the world directory, whose name IS
the attempt id), so two workers cannot share a marker.

## What the gates do NOT claim

- **§D2-LIVE does not exercise promotion authority.** It stops at `ELIGIBLE` with ZERO promotion facts.
- **§D4-LIVE does not claim two results can both be reused.** It claims *serial canonicalization still holds
  under real concurrency*: the first result enters canonical, the second is correctly judged not reusable.
  Under the deployment's only honest read footprint (the whole repository) the second result's change
  genuinely does overlap the first's, so refusing it is the CORRECT answer rather than a gap. See
  `docs/engineering/37-lean-governance-spec.md` appendix P.

$$\boxed{\text{concurrent production} \neq \text{concurrent reuse}}$$
