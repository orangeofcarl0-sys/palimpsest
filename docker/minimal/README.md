# Minimal clean environment (production-ledger first-use evidence)

A consumer-grade palimpsest session in a STOCK `node:24-bookworm` container:
clean `$DSH_HOME`, a real git repo, the release-tarball consumption channel
(pnpm overrides point the inter-deps at the ordarium-v1.2.0 GitHub tarballs),
and a full durable session ending in a real git merge promotion.

Run from the repo root (tarball must be packed first):

```sh
npm pack
docker run --rm \
  -v "$(pwd -W):/workspace" \
  -e HTTPS_PROXY=http://host.docker.internal:10808 \
  -e HTTP_PROXY=http://host.docker.internal:10808 \
  node:24-bookworm sh /workspace/docker/minimal/e2e.sh
```

The script asserts, against the clean-environment databases:

| assertion | meaning |
|---|---|
| `productionLedgerOperations >= 3` | the shared Ordarium ledger recorded real Safe Action operations (worktree/commit/promote/gate) — 命题二判据② first sample |
| `telemetrySubjects >= 1` | attributed telemetry deltas landed under `palimpsest.telemetry.v1` on the shared ledger (second project, same ledger) |
| `contextManifests == 1` && `contextManifestEvents == 1` | the canonical context manifest is event-sourced and projected |

Session flow: dispatch → claim (real worktree) → context manifest (hash chain)
→ work commit → gate evidence (python -m pytest) → report → real-merge
promotion (`PROMOTION_COMMITTED`).

## Crash-recovery E2E (`recovery.sh`)

Same clean-container shape as `e2e.sh`, but the promote is SIGKILLed while its
Ordarium operation is mid-flight: `docker/minimal/killer.mjs` polls the
operations ledger and delivers a real SIGKILL the moment the promote operation
reaches `dispatched` (the git merge it wraps is in flight). After the engine's
operation lease expires (default 30s), one `palimpsest run` recovers the
orphaned promotion through the reconcilable engine — reclaim → reconcile →
redispatch → `PROMOTION_COMMITTED` with reason "recovered: Ordarium reconciled
the interrupted operation", exactly one merge commit on main. No fault
injector and no test double: real signal, real ledgers, shipped recovery path.

```sh
docker run --rm \
  -v "$(pwd -W):/workspace" \
  -e HTTPS_PROXY=http://host.docker.internal:10808 \
  -e HTTP_PROXY=http://host.docker.internal:10808 \
  node:24-bookworm sh /workspace/docker/minimal/recovery.sh
```
