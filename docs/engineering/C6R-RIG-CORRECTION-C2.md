# C6-R — Rig Correction C2: Provider Gateway Retry and Session Guard

**Status:** pre-registered before the P1 re-execution under the retry.
**Trigger:** the opencode gateway's connection instability:
- probe: 3 `502 read ECONNRESET` then a successful 200;
- P1a: many resets, many 200s, then a final `502` that ended an 11.1-minute turn;
- P1b: **6/6** attempts reset before any assistant turn, 0 tokens.
**Old Code Freeze:** `7b80a17` / tree `d1fadcf`.
**New Code Freeze:** recorded after the retry is verified.

---

## 1. What is retried, and why it is safe

The proxy buffers the request body once and replays the exact bytes. It retries **only** an error that
occurs before any response header or body byte reaches DSH:

| condition | action |
| --- | --- |
| `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `EPIPE`, `EAI_AGAIN`, `ENETRESET`, `ENETUNREACH`, `EHOSTUNREACH`, `UND_ERR_SOCKET`, `UPSTREAM_TIMEOUT` before a response | retry |
| any error after the response has started | **never retry** — a partial answer must not be duplicated or corrupted |
| HTTP 4xx/5xx response | pass through; DSH's own retry policy owns it |
| body larger than 64 MiB | refuse with 413, no retry |

Bounds: **4 attempts**, delays **500 / 1000 / 2000 ms**, per-attempt upstream timeout **180 s**. No
unbounded retry loop. The credential and the request body are never logged.

The proxy uses a fresh upstream connection per attempt (`agent: false`) so a stale pooled socket
cannot cause a spurious reset.

## 2. What is not changed

- Provider, model, key source, endpoint, `x-opencode-session` header and egress allow-list.
- The P1/F1 prompt, T1/T2 scenario, P/F worlds, requirements, operator policy, rubric and authority
  boundary.
- The model's cognition. Retrying a request that never produced a response does not change what the
  model sees or answers.

## 3. Session guard

The 8-minute **target** remains the target. The hard guard is raised from 480 s to **900 s** so a turn
that is progressing through legitimate tool work and retries is not killed by the guard itself. The
hard token and session caps are unchanged. P1a's 666 s would have fit under the 900 s guard.

## 4. Verification

- Pure policy tests: `test/c6r_upstream_retry.test.ts`.
- Live self-test: `scripts/c6r/retry_selftest.mjs` runs a local flaky HTTP upstream that destroys the
  first two connections; the proxy must retry them and return the third attempt's 200. No provider,
  no model, no credential. Evidence: `research-evidence/c6r/retry-selftest/`.
- The OpenAI route mock qualification is re-run against the updated proxy.

## 5. Re-execution decision

P1a (`c6r-002`, INVALID partial) and P1b (`c6r-003`, BLOCKED) are preserved and **not pooled**. The
re-execution is a new run, `c6r-004`, with the same prompt, T1 world, provider/model and authority
policy, under the new Code Freeze:

1. P1c (session 4 of 6), then
2. F1 (session 5 of 6).

There is no further P1 re-execution. If P1c or F1 is blocked, truncated or invalid, it is preserved
and the comparison is reported incomplete. The remaining session (if any) cannot cover both P3 and F2;
fresh continuity will be reported as `NOT EXERCISED` unless a T1 effect is executed and a single
remaining session can be allocated to one side.

## 6. Budget

| item | sessions | tokens |
| --- | --- | --- |
| probe | 1 | 3,587 |
| P1a (invalid) | 2 | 790,661 |
| P1b (blocked) | 3 | 0 |
| P1c (planned) | 4 | unknown |
| F1 (planned) | 5 | unknown |

Hard caps: 6 sessions, 8,000,000 reported tokens, no new session at 5,000,000. The retry does not
relax them; it only reduces transport-induced failures before a response.
