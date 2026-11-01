# C6-R — Retry and P1c Addendum

**Provider:** `opencode` / `deepseek-v4.1-flash`.
**Code Freeze 4:** `7cd5e1c08448f82dec70441ad481329d89716311` / tree
`0e5c623f739642de2b85682569c52f13fb38462c`.
**Result:** the bounded retry works as designed and recovered several individual requests, but the
gateway's sustained reset rate still prevented a complete P1. P1c hit the 900-second guard with
**46,213 tokens** and **4 assistant messages**. The model campaign stopped; no F1.

---

## 1. The retry

`scripts/c6r/provider_proxy.mjs` now:

- buffers the request body once and replays the exact bytes;
- retries only **pre-response** transport errors (`ECONNRESET`, `ETIMEDOUT`, `EPIPE`, …);
- uses **4 attempts** with **500 / 1000 / 2000 ms** backoff;
- opens a fresh upstream connection per attempt;
- never retries after a response has started;
- passes HTTP statuses through to DSH;
- caps the body at 64 MiB;
- never logs the credential or body.

**Live self-test** (`scripts/c6r/retry_selftest.mjs`): a local flaky upstream destroyed the first two
connections; the proxy retried them and returned the third attempt's 200. Evidence:
`research-evidence/c6r/retry-selftest/retry-selftest.json`.

The policy is regression-tested by `test/c6r_upstream_retry.test.ts` (4 tests).

## 2. How the gateway behaved in P1c

P1c ran under Code Freeze 4 with the retry and a 900-second guard. The proxy log shows the pattern:

- many requests: `attempt 1` `ECONNRESET` → `attempt 2` `ECONNRESET` → `attempt 3` `ECONNRESET` →
  `attempt 4` `attempts_exhausted`;
- some requests recovered on attempt 2 or 4 with a 200;
- the retry delays and the 20-second reset cadence consumed most of the 900 seconds;
- only **4 assistant messages** and **11 tool calls** completed before the guard killed the session
  (`exit 124`).

The retry therefore **reduced** the immediate failure surface (P1b had zero turns; P1c had four), but
the gateway's failure rate was still too high for a complete turn.

## 3. P1c behavior

Even in the truncated turn, the model independently reproduced the P1a discovery:

- it read the T1 inbox and canonical data;
- it identified V3's `-10 → 0 °C` change;
- it reasoned: "Site B design min -4: V3 at 0°C no longer fits … no vendor fits Site B if this
  bulletin is accepted";
- it kept the candidate `UNACCEPTED` and said acceptance requires the programme lead;
- it considered proposing an intake task and did not modify canonical data.

It did not complete a proposal task or a final answer. Its run is `INVALID` (incomplete stream,
exit 124), preserved at `research-evidence/c6r/runs/c6r-004/P1/`.

## 4. The two partial observations, together

| | P1a (`c6r-002`) | P1c (`c6r-004`) |
| --- | --- | --- |
| provider risk | final 502 | sustained resets → timeout |
| assistant messages | 21 | 4 |
| tool calls | 43 | 11 |
| tokens | 790,661 | 46,213 |
| candidate discovered | yes | yes |
| V3 `-10 → 0` | yes | yes |
| Site B no compliant vendor | yes | yes |
| candidate kept unaccepted | yes | yes |
| canonical mutation | none | none |
| completed proposal | no | no |
| final answer | no | no |

Two independent sessions reached the same discovery and the same authority conclusion before the
transport failed. That is a **replicated partial observation**, not a completed trial. H6-D/H6-N are
**suggested** by both runs; they are not established as a completed result, and no proposal,
authorization, effect or comparison exists.

## 5. Stop decision

The campaign stopped after P1c:

- sessions used: **4** (probe, P1a, P1b, P1c); hard cap 6;
- reported tokens: **840,461** (3,587 + 790,661 + 0 + 46,213); hard cap 8,000,000; stop-start
  threshold 5,000,000 not reached;
- no F1, no P3, no F2;
- further P1 attempts would consume the remaining sessions without a stable provider and would not
  produce a valid matched pair.

## 6. What remains

The product is not the measured bottleneck. Two partial runs used the existing 20 Palimpsest tools,
found the material candidate, applied the Site B constraints and respected the acceptance boundary.
The gateway's sustained `ECONNRESET` rate is.

The smallest decisive next test remains:

1. stabilize the opencode gateway / use a stable funded endpoint (owner/environment action);
2. run **one** P1 under Code Freeze 4 with the retry and no prompt/scenario change;
3. if it completes, run F1; if it does not, preserve and stop.

Do not add a router, scheduler, ticket database, approval authority or durable agent runtime. The
partial runs show the existing surfaces are usable when the transport holds.
