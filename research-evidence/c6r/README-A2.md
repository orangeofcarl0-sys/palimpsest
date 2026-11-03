# C6-R Evidence — Provider Amendment A2

The original Evidence Freeze (`f6dfd89`, manifest `8d2ff6e`) remains valid for the deterministic
qualification and the first provider probe. This directory now also contains the owner-authorized
provider change and its results.

## Provider

- `opencode` / `deepseek-v4.1-flash`, OpenAI Chat Completions at `https://opencode.ai/zen/go/v1`.
- Key read from ZCode `provider_config.json` by the proxy **outside** the sandbox; never entered it.
- Code Freeze 2 `508c9a0` / tree `1c842de`; Rig Correction C1 / Code Freeze 3 `7b80a17` / tree
  `d1fadcf`.

## New evidence

| path | content |
| --- | --- |
| `opencode-probe/20261101T181503Z/` | one availability probe: 3 resets then `PROBE_OK`, 3,587 tokens |
| `opencode-route/` | mock qualification of the pi-ai OpenAI route; real adapter, real proxy, no provider token |
| `runs/c6r-002/` | P1a: 21 assistant messages, 43 tool calls, 790,661 tokens, then a 502; state `INVALID`, partial diagnostic |
| `runs/c6r-003/` | P1b: six 502 resets, 0 assistant messages, 0 tokens; state `BLOCKED` |
| `verification/code-freeze-2/`, `code-freeze-3/` | build, architecture, public API, targeted logs |
| `outcomes-a2.json` | amended aggregate outcomes |
| `manifest-final.json` | SHA-256 of the amended committed evidence (final addendum) |

## Labels

- `MOCK_MODEL` — the route qualification; never counted as Agent behavior.
- `PARTIAL_DIAGNOSTIC` — P1a. The model discovered Candidate A, identified V3's `-10 → 0` change,
  concluded Site B has no compliant vendor, kept the candidate unaccepted, and made no project
  mutation. The turn then ended in a provider 502. This is **not** a completed P1.
- `BLOCKED` — P1b; no assistant turn.

F1, P3 and F2 were not run. There is no matched pair and no comparative claim.
