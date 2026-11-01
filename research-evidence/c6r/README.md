# C6-R Evidence

**Stage:** Agent-Native Behavioral Qualification & Comparative Value.
**Code Freeze:** `103c4eb107418e0d253d27681ec33f77b0514de3` / tree
`b3f4004b056c1c789bc0b6fc7281cc5ba5b77f1f`.
**Run:** `c6r-001`, state `BLOCKED`, reason `provider_transport_reset`.

Every model-shaped record here is one of:

- `MOCK_MODEL` — a scripted Messages stand-in drove the real tool path. Not cognition, not usage.
- `PROVIDER_PROBE_BLOCKED` — one real provider attempt, no assistant turn, no tokens.
- `NO_MODEL` — deterministic engineering evidence.

## Layout

| path | content |
| --- | --- |
| `preflight.txt` | read-only Git/state capture before the branch |
| `provenance/cog6-audit.json` | mechanical audit of COG-6's ambiguous `acceptedCapabilitiesDigest` |
| `runtime/` | isolated runtime composition, canaries, mock session, proxy/bridge logs, inventory |
| `p1-host/` | neutral P1 seed, real Palimpsest host boot, 20-tool catalogue, product read results |
| `f1-host/` | native Git/Markdown world, generated handoff, 8-dimension equivalence audit |
| `budget/` | process-group termination self-test (child + grandchild gone) |
| `verification/` | build, architecture, public API and targeted-test logs at the Code Freeze |
| `probe/20261101T173008Z/` | the one provider probe: six upstream resets, zero assistant turns, zero tokens |
| `runs/c6r-001/run.json` | immutable run identity, Code Freeze, P1/F1 preparation, BLOCKED transition |
| `outcomes.json` | aggregate outcomes, gates, identities and limitations |
| `manifest.json` | SHA-256 of the committed evidence blobs (evidence-only addendum) |

## What is not in this directory

- No model transcript: no model turn exists.
- No credential: the real provider key stayed outside the sandbox and was never logged.
- No evaluator oracle inside any model-visible world.
- No fabricated P/F result. The mock sessions are labelled and are not counted as Agent behavior.

## The decisive blocker

The isolated runtime resolves `api.deepseek.com` to the host proxy's fake-IP `198.18.0.38`; TCP 443
connects and the TLS handshake does not complete. Six adapter attempts all returned `502 read
ECONNRESET`; the turn ended with `SERVER 502`; there are zero assistant messages and zero reported
tokens. This is not a quota observation. The last recorded provider status remains COG-6's
`QUOTA: Insufficient Balance`.

The next step requires the provider to be reachable from the isolated runtime and a new Code Freeze
for the probe harness's WSL identity read, followed by exactly one P1 discovery session.
