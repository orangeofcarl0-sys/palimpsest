# C6-R — Engineering Report

**Branch:** `palimpsest-c6r-behavioral-qualification`
**Incoming baseline:** `d1a05a7bfc145258efa34c2710998db04680d266` / tree
`e96cec6318bb35639e7083b222b811b8b2f59b11`
**Code Freeze (executable):** `103c4eb107418e0d253d27681ec33f77b0514de3` / tree
`b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f`
**Evidence Freeze:** forward; a commit cannot contain its own SHA.
**Model:** one bounded probe; **BLOCKED at the provider transport**; zero assistant turns; zero
reported tokens.

---

## 1. Git integrity

| item | value |
| --- | --- |
| incoming HEAD / tree | `d1a05a7…` / `e96cec6…` — verified read-only before mutation |
| branch | `palimpsest-c6r-behavioral-qualification`, created once from `d1a05a7` |
| C6-R0 | `5f917d9` / `d414883` — preflight, provenance audit + erratum, collector, amendment A1 |
| C6-R1/R2 | `1868898` / `ffda00e` — staging, isolated runtime, provider-only egress, runtime evidence |
| C6-R3/R4 | `103c4eb` / `b3f4004` — P1/F1 worlds, equivalence, state, usage, budget, probe |
| verification addendum | `2411eef` — logs and run record; no executable change |
| production files changed | **none in C6-R** |
| inherited production change | COG-6's `src/composition/continuation.ts` revision fix remains active |
| executable change after Code Freeze | **none** |
| protected `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b`, unchanged |
| PR / merge / tag / branch deletion / worktree prune / lock removal / force-push | **none** |

Protected resources before and after: 95 worktree registrations, 2 locks, 19 gate roots, 0 stashes;
74 pre-existing evidence trees, with `c6r` as the 75th. No historical freeze was amended.

## 2. What was added

C6-R added experiment and qualification code, not product authority:

- `scripts/c6r/provenance.mjs` — canonical source evaluation from a committed blob at a named head;
- `scripts/c6r/staging.mjs` — T1/T2 visibility, digest verification, future-leak detection;
- `scripts/c6r/session_stream.mjs` — v4 stream decoding and deduplicated usage accounting;
- `scripts/c6r/budget.mjs`, `budget_selftest.mjs` — pre-registered limits and process-group kill;
- `scripts/c6r/runner.mjs`, `run_c6r.mjs` — run identity, state machine, gate, probe;
- `scripts/c6r/seed_p1.mjs`, `build_f1.mjs` — neutral P1 and fair F1 initializers;
- `scripts/c6r/mock_llm.mjs`, `net_bridge.mjs`, `provider_proxy.mjs`, `egress_policy.mjs` — the
  runtime qualification and provider-only egress;
- `scripts/c6r/qualify_wsl.sh`, `qualify_p1_wsl.sh`, `probe_provider_wsl.sh`, collectors and
  `prepare_wsl_product.sh` — the reproducible WSL/bwrap harness;
- five test files: `test/c6r_{source_provenance,scenario_visibility,runtime_policy,runner_states,
  usage_accounting}.test.ts`.

No new authority root, approval DB, intent admission authority, second promotion path, router,
scheduler, subscription system, result ledger, goal ontology, filesystem sandbox, LayerFS or durable
agent runtime was introduced. No production Palimpsest source was changed.

## 3. Verification at the Code Freeze

Logs: `research-evidence/c6r/verification/`.

| check | command | result |
| --- | --- | --- |
| build | `pnpm run build` | **exit 0** (one Node engine warning: v24.14.1 vs `>=24.15.0`) |
| architecture | `pnpm run architecture:check` | **PASS**, 0 violations, 9 accepted exceptions |
| public API | `pnpm run architecture:check-public-api` | **PASS**, 0 missing, 0 changed kind, 0 added |
| targeted | `vitest run <8 files> --maxWorkers=1` | **8 files, 72 tests, 0 failed** |

The targeted set is the five C6-R files plus `lean_d5d_result_continuation_service`,
`lean_d5c3_current_basis_reexecution` and `cog5_promotion_lineage`. The broad suite was not run; no
broad pass is claimed.

## 4. Runtime qualification

Detailed in `C6R-DSH-RUNTIME-QUALIFICATION.md` and `C6R-EXPERIMENT-RIG-QUALIFICATION.md`.

- **Windows host:** DSH `0.2.1-rc.3`; the default Windows composition uses `pwsh-sandbox`, and the
  ACL backend confines **writes and deletes only**. Reads, network and process visibility are not
  confined. COG-6's `bash-local` substitution also broke permission-preset activation. Windows is
  therefore excluded from scored execution.
- **Isolated runtime:** WSL2 + outer `bubblewrap 0.11.1`, no `/mnt`, `/home`, `/root`; private PID
  and network namespaces; a loopback bridge to a provider-only Unix-socket proxy that permits exactly
  `POST /v1/messages`.
- **Measured canaries:** the oracle path is unreachable; `/mnt` and `/home` are empty; a mode-000
  canary is unreadable; out-of-workspace writes are denied; in-workspace and `/tmp` writes succeed;
  self-escalation is refused; the Bash environment contains no inherited secret; external DNS fails;
  the proxy rejects any non-provider route with 403.
- **Real P1 host:** 20 `palimpsest_*` tools compose over the neutral world; status, overview, journal,
  T1 inbox and pre-candidate capabilities read correctly.
- **Mock qualification:** no model; every record is labelled `MOCK_MODEL`. The 2,070 synthetic tokens
  are not model usage.

## 5. The provider probe

One bounded probe was executed after the Code Freeze through the isolated runtime:

- 6 adapter attempts, 5 retries; every upstream attempt returned `502` with `read ECONNRESET`;
- 0 assistant messages, 0 reported tokens, turn end `{kind: "error", code: "SERVER", status: 502}`;
- the permission preset `workspace-write` activated and 17 real tools were logged;
- WSL resolves `api.deepseek.com` to the host proxy's fake-IP `198.18.0.38`; TCP 443 connects and TLS
  does not complete;
- the credential format is valid and the secret never entered the sandbox.

This is a **network/transport blocker**, not a quota result and not a cognitive observation. The
probe shell also had a harness defect: its final identity step called `git` inside WSL, where a linked
worktree with a Windows `gitdir` path is not resolvable. The provider attempt had already finished;
the failure prevented automatic `probe-result.json`, which was reconstructed from the preserved
streams and logs and labelled `HARNESS_NETWORK_DEFECT`. The defect was not patched after the Code
Freeze.

Run `c6r-001` is `BLOCKED` with reason `provider_transport_reset`.

## 6. Usage and budget

- Usage comes from the session stream, not console text: multi-frame zstd decode, `(sessionId, seq)`
  deduplication, sum of independent sessions, no invention for missing usage.
- Budget bounds: 6 sessions, 8,000,000 tokens, stop starting at 5,000,000, 8 minutes per session,
  sequential.
- Process-group self-test in WSL: a dummy shell and its grandchild were both gone after `SIGKILL`;
  the mechanism is `POSIX process group`, and the limit is a local monitor, not a server-side cap.
- The probe used no budget tokens because no provider response was received.

## 7. Limitations

1. No real model turn, P1/F1 session, Agent proposal, authorized effect, fresh session or comparison.
2. The isolated runtime cannot currently reach the provider because of the host proxy's fake-IP/TLS
   reset; the last recorded provider status remains COG-6's `QUOTA`.
3. The probe harness's WSL identity read is defective; it is recorded, not patched after the freeze.
4. Windows cannot be used for read confinement; the WSL/bwrap runtime is the only qualified one.
5. Node is `v24.14.1` while the package declares `>=24.15.0`; the warning is preserved.
6. The P1/F1 scored launch path was not exercised with a model; only the probe and the mock
   qualifications ran.
7. The public repository is reachable in principle from a networked process; the isolated runtime
   blocks it and permits only the provider route. The oracle itself is never copied into the sandbox.
8. The mock qualification proves runtime behavior only; it is not evidence of cognition.

## 8. Reproduction

```bash
# deterministic regressions
pnpm run build
pnpm run architecture:check
pnpm run architecture:check-public-api
npx vitest run test/c6r_source_provenance.test.ts test/c6r_scenario_visibility.test.ts \
  test/c6r_runtime_policy.test.ts test/c6r_runner_states.test.ts test/c6r_usage_accounting.test.ts \
  test/lean_d5d_result_continuation_service.test.ts test/lean_d5c3_current_basis_reexecution.test.ts \
  test/cog5_promotion_lineage.test.ts --maxWorkers=1

# Linux product and isolated runtime (WSL)
bash scripts/c6r/prepare_wsl_product.sh
REPO=/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1 bash scripts/c6r/qualify_wsl.sh
REPO=/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1 bash scripts/c6r/qualify_p1_wsl.sh

# P1/F1 worlds and equivalence
node /home/admini/c6r/product/scripts/c6r/seed_p1.mjs --run=<dir> --sandbox-root=/run/p1
node scripts/c6r/build_f1.mjs --p1-run=<dir> --run=<f1-dir>

# run record, one probe, gate
node scripts/c6r/run_c6r.mjs --prepare=<id>
node scripts/c6r/run_c6r.mjs --probe=<id>
node scripts/c6r/run_c6r.mjs --gate
```

## 9. Identities

| item | value |
| --- | --- |
| Code Freeze | `103c4eb107418e0d253d27681ec33f77b0514de3` / tree `b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f` |
| verification addendum | `2411eef74f9c6aabba59531061db0a3f03ac6966` |
| run | `c6r-001`, state `BLOCKED`, reason `provider_transport_reset` |
| probe | `research-evidence/c6r/probe/20261101T173008Z/` |
| P1 world head | `e7eeb903476dc60c598a1824728da567d0944b4d`, revision 3 |
| P1 visible set | `021b639db41a6fbc141b0d1add01e70e66dd674ac718ef0ac0a0bdeac6e5bf3b` |
| F1 head | `31ee2f288d49aec3825367853a73da454118d495` |
| equivalence | 8/8 same, 0 confounders |
| target tests | 8 files / 72 tests, 0 failed |
| protected resources | 95 worktrees, 2 locks, 19 gate roots, 75 evidence trees, 0 stashes |
