# S07 — Runtime, recovery and cost

## 1. Doctor

`palimpsest doctor --repo=<path>` reports, from the installed runtime:

- Node version vs the package engine (WARN, not a fabricated PASS, when it is below);
- Git presence and whether the path is a real work tree;
- the installed DSH version;
- the installed `@ordarium/core` version;
- state-directory writability;
- the platform sandbox: Linux/WSL2 bubblewrap is the qualified stack; Windows is write-confinement
  only; other platforms are UNKNOWN;
- provider/credential path PRESENCE (contents are never read) — a missing path is UNKNOWN/WARN;
- live model: `READY` only when a spend authorization reference is supplied, otherwise `BLOCKED`;
- the advertised tool profile.

The report never reads or prints a credential value.

## 2. Usage accounting

`src/runtime/usage.ts`:

- dedupes by `(sessionId, seq)`; a conflicting counter under the same identity throws;
- sums input/output/cache-read/cache-write separately; cache tokens are not priced as fresh input;
- a missing usage counter is counted as missing, not zero;
- classifies a run: OBSERVED, INVALID (provider error during a turn, timeout, budget, cancellation),
  or BLOCKED (no assistant turn).

## 3. Budget gate

`canStartSession` refuses a launch when the session cap, the stop-new-launches threshold, or the
paired in-flight reservation would be exceeded. The PC1 window suggestion remains a recommendation;
the product entry does not silently authorize spend.

## 4. Process-tree stop

`terminateProcessTree` sends SIGKILL to the process group on POSIX and `taskkill /T /F` on Windows.
The test spawns a child that spawns a grandchild and verifies the descendant is gone.

## 5. Tests and evidence

`test/pc1_runtime.test.ts` (7 tests): doctor facts and BLOCKED live model; usage dedupe/split/missing;
classification; budget gate; process-tree stop.

## 6. Residual limits

- The doctor is a local diagnostic; it does not prove a provider will accept a request.
- The Windows process-tree stop is tested on this host; Linux WSL2 is the qualified scored runtime
  and is not exercised by this specific test.
- A provider quota error remains a resource block, not a model failure.
