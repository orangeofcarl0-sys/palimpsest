# LHAPE harnesses

These scripts are test-owned engineering harnesses, not product components and not a model.
They run the REAL Windows DSH host and the REAL Palimpsest product with a deterministic Messages
stand-in (`mock_llm.mjs`). Every record is labelled `MOCK_MODEL_REAL_DSH_HOST`; no provider is called.

## Real Windows host scenarios

Requirements:

- Windows with a machine-global DSH install (`@deepseek-ai/dsh`, the host package).
- Node 24 (the repository's `node_modules` is used for the product build).
- A run-owned `@deepseek-ai/dsh-win32-process@0.2.1-rc.5` seam. `run_host_win.sh` installs it once
  into `%USERPROFILE%\lhape\seam`.
- The worker pre-create read fence needs a profile-root location with WRITE_DAC. The run roots are
  under `%USERPROFILE%\lhape`.

Commands:

```bash
bash scripts/lhape/run_host_win.sh main
bash scripts/lhape/run_host_win.sh interrupt
```

`main` starts two baseline workers in two hosts (each host admits one active confidential worker),
delivers a measured constraint after they start, applies a real plan revision, releases the parked
baseline workers after the revision, reworks the stale cost result in a new principal host, starts a
third new principal host for integration, and promotes the three accepted results.

`interrupt` commits an artifact in a real worker, kills the real Windows host process tree, and
recovers the committed world from a new host.

Evidence is written under `%USERPROFILE%\lhape\<scenario>\`; the checked-in copy is
`research-evidence/lhape/2026-11-03/`.

## Deterministic cohort gate (LHAPE-C)

```bash
node scripts/lhape/run_cohort.mjs \
  --cohort=research-evidence/lhape/live/cohort-pre-registration.json
```

Without a current `lhape-spend-authorization/v1` this writes `BLOCKED.json`, starts nothing and exits 2.
`--execute` additionally runs each session behind the existing real-usage budget guard
(`scripts/aps/budget_guard.mjs`). There is no LHAPE authorization in this delivery.

## File map

| File | Role |
|---|---|
| `run_host_win.sh` | Windows host orchestration, two-host concurrency, replan/rework/integration and kill/recovery |
| `prepare_run.mjs` | Seeds the world/project/deployment and the deterministic scripts |
| `mock_llm.mjs` | Deterministic Messages stand-in (labeled; `__DIGEST__` / `__RESULT_COMMIT__` refer to the latest real tool result) |
| `operator_promote.mjs` | Test-owned operator acceptance on the canonical Promotion path |
| `final_pulse.mjs` | Read-only final pulse/workers/results projection |
| `summarize_run.mjs` | Run summary with session overlap and artifact hashes |
| `worker_tee.mjs` | Diagnostic tee around the real worker process (not a product component) |
| `win_worker_probe.mjs` | One-worker Windows probe used to qualify the read fence/PTC path |
| `run_cohort.mjs` | Fail-closed LHAPE-C cohort gate |
| `cohort_session.mjs` | Authorized per-session entry; refuses without the same authorization |
