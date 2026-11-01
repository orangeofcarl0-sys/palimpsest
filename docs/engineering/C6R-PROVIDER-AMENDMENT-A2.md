# C6-R — Provider Amendment A2

**Status:** owner-authorized provider change, pre-registered before any scored model execution under
the new route.
**Owner instruction:** use `opencode/deepseek-v4.1-flash`; the key is available from the ZCode
configuration.
**Old route:** `deepseek-official` / `deepseek-flash` — probe `c6r-001` **BLOCKED** at the network
transport (`api.deepseek.com` resolved to the host proxy's fake-IP `198.18.0.38`; TLS reset).
**New route:** `opencode` / `deepseek-v4.1-flash` — the provider this ZCode session itself uses.
**New Code Freeze:** recorded after the executable changes in this amendment are verified.
**Old evidence:** `research-evidence/c6r/**` and the Evidence Freeze `f6dfd89` remain immutable.

---

## 1. The exact provider

| field | value |
| --- | --- |
| ZCode provider name | `opencode go orange` |
| ZCode provider id | `5c7f8d75-e85e-4de5-9b27-e2b59eab1c7a` |
| protocol | OpenAI Chat Completions |
| base URL | `https://opencode.ai/zen/go/v1` |
| model | `deepseek-v4.1-flash` |
| additional header | `x-opencode-session: zcode-5c7f8d75-20260913` |
| key source | `C:\Users\66494\.zcode\v2\provider_config.json`, `config.providerConfigRules.providerRules[].config.access.apiKey` for that provider id |
| key length / prefix | 51 characters; **not** logged, **not** copied into the sandbox |

The `provider_config.json` is read by the provider proxy **outside** the model's bwrap view. The
sandbox receives only a placeholder (`C6R_PLACEHOLDER`). The key never enters the sandbox, the
session stream or the evidence directory.

## 2. Reachability, measured without a model request

From WSL, before the probe:

- DNS: `opencode.ai` → `172.65.90.20`–`172.65.90.23` (real addresses, not a fake-IP range);
- TCP 443: connected;
- TLS 1.3: `CONNECTION ESTABLISHED`, certificate `CN=opencode.ai`, verification OK.

Unlike `api.deepseek.com`, this host is not intercepted by the host proxy. The isolated runtime can
therefore reach it.

## 3. The DSH route

The installed `@deepseek-ai/dsh-llm-pi-ai` adapter (0.2.1-rc.3) declares a hand-configured route:

```yaml
- id: llm-deepseek
  disabled: true
- id: llm-pi-ai
  config:
    providers:
      opencode:
        displayName: OpenCode Go
        api: openai-completions
        baseURL: http://127.0.0.1:18080/v1
        apiKeyEnv: C6R_PLACEHOLDER
        headers:
          x-opencode-session: zcode-5c7f8d75-20260913
        compat:
          thinkingFormat: deepseek
        defaultContextWindow: 1000000
        defaultMaxTokens: 262144
        reasoning: high
        models:
          - id: deepseek-v4.1-flash
            name: DeepSeek V4.1 Flash
            reasoningEfforts:
              off:
              high: high
- id: agent-default-model
  config:
    provider: opencode
    model: deepseek-v4.1-flash
```

Inside the sandbox the base URL is the loopback bridge; the provider proxy forwards exactly
`POST /v1/chat/completions` to `https://opencode.ai/zen/go/v1/chat/completions`, stripping the
placeholder and injecting `Authorization: Bearer <real key>`.

## 4. Route qualification with a stand-in

`scripts/c6r/qualify_opencode_wsl.sh` ran the **real** DSH pi-ai adapter against a local OpenAI Chat
Completions stand-in. This is `MOCK_MODEL`, not a provider call:

- the request used model `deepseek-v4.1-flash`, `stream: true`, and the 17-tool base catalogue;
- the proxy allowed only `POST /v1/chat/completions` and forwarded both turns with status 200;
- the scripted bash call executed and the second turn returned `OPENAI_ROUTE_OK`;
- no provider token was spent.

Evidence: `research-evidence/c6r/opencode-route/`.

## 5. Fairness

Both P and F use the same new route, model, prompts, authorization policy, budget and runtime. The
model identity is recorded on every condition. No condition receives a different provider, model or
capability. The previous Anthropic route and its blocked probe remain in the record; they are not
pooled with the new observations.

The comparison label is **Matched Single-Principal DSH Baseline**; subagents and workflow remain
disabled in both conditions.

## 6. What changes, and what does not

- **Changes:** the provider/model identity, the pi-ai profile route, the OpenAI egress mode and its
  tests, the probe and scored launchers.
- **Does not change:** the scenario bytes, T1/T2, the business requirements, the P/F worlds, the
  operator policy, the rubric, the budget bounds, the isolated runtime, or the no-fabrication rules.
- **New run:** `c6r-002`, with `provider = opencode / deepseek-v4.1-flash`. The old run `c6r-001`
  remains `BLOCKED` under `deepseek-official`.
- **One probe:** exactly one availability probe under the new configuration. If it fails, no scored
  session is started and the failure is preserved.

## 7. Gate effects

This amendment does not change R0, R1, R2 or R3. It makes R4 possible by replacing an unreachable
provider with the owner's active, reachable one. R4–R7 remain `BLOCKED` until a real model turn
arrives.
