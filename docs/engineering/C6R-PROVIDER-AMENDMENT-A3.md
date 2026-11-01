# C6-R — Provider Amendment A3: Return to the DeepSeek Official Channel

**Status:** owner-authorized provider return, pre-registered before the scored pair.
**Owner instruction:** switch back to the DeepSeek official channel and continue.
**Route:** `deepseek-official` / `deepseek-flash`, Anthropic Messages at
`https://api.deepseek.com/anthropic`.
**Old route:** `opencode` / `deepseek-v4.1-flash` (runs `c6r-002`, `c6r-003`, `c6r-004`; two partial
diagnostics, one blocked; preserved and not pooled).
**New Code Freeze:** recorded after the switch is verified.

---

## 1. The network path

The previous direct WSL path to `api.deepseek.com` was blocked: DNS returned the host proxy's fake-IP
`198.18.0.38`, TCP connected, and TLS did not complete.

The current path uses the host's own network stack:

```text
DSH in bwrap
  → 127.0.0.1:18080 net_bridge
  → Unix socket (WSL)
  → provider_proxy (WSL, outside bwrap)
  → https-proxy-agent → http://127.0.0.1:7890 (Windows CONNECT proxy, mirrored networking)
  → https://api.deepseek.com/anthropic/v1/messages
```

WSL is configured with `networkingMode=mirrored`, so `127.0.0.1:7890` reaches the Windows proxy. The
pre-check (`research-evidence/c6r/deepseek-connect/precheck.json`) is an **unauthenticated** `GET /`:

- TLS: connected;
- HTTP: **401** with a provider request id;
- key: present, 35 characters, `sk-`, read from the owner's DSH credential store outside the
  sandbox;
- no model request, no key sent.

## 2. The provider route

- `llm-deepseek` (Anthropic Messages) with `baseURL http://127.0.0.1:18080`, `apiKeyEnv
  C6R_PLACEHOLDER`;
- the proxy forwards exactly `POST /v1/messages` to `https://api.deepseek.com/anthropic/v1/messages`,
  strips the placeholder and injects `x-api-key: <real key>`;
- `agent-default-model`: `deepseek-official` / `deepseek-flash`;
- `llm-pi-ai` disabled;
- the same `workspace-write` sandbox, `approval: never`, provider-only egress, retry policy and
  900-second guard;
- the key never enters the sandbox.

## 3. Session plan and budget

| session | condition |
| --- | --- |
| 1–4 | probe, P1a, P1b, P1c (preserved) |
| **5** | **P1** — official channel |
| **6** | **F1** — official channel |

The 6-session hard cap is exactly reached by the P1/F1 pair. There is no separate model probe: the
unauthenticated pre-check proves network reachability, and the P1 session is the availability test
for the key/quota. If P1 is `BLOCKED` (quota/auth/transport), no F1 is started and the stage reports
the blocker. No P3/F2 session is possible within the cap; fresh continuity remains `NOT EXERCISED`.

Token budget: 840,461 reported before the pair; the hard cap is 8,000,000 and the stop-start
threshold is 5,000,000. The pair is expected to remain well below it.

## 4. What is unchanged

The P1/F1 prompts, T1/T2 scenario, P/F worlds, requirements, operator policy, rubric, authority
boundary, retry policy, sandbox and evidence rules. The two runs are new (`c6r-005`), so the official
channel is not pooled with the opencode partials.

## 5. Conclusion discipline

- A completed P1/F1 pair is still a two-session observation, not statistical superiority.
- The previous partials suggest discovery and authority reasoning, but they do not establish R4.
- If the official provider is quota-blocked, the result is `BLOCKED`, not an unfavourable cognitive
  result, and no F1 is fabricated.
