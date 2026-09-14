# G10-Q — Real Host Cognitive Federation & Anti-Waste Reconciliation (Spec)

Ordarium-bound substrate → DSH/Pi cognition → two persistent project principals → no manual relay.

Baseline: `main @ d16a7d7c6ae67d7930fe662c7c777941481a31c3`. Nothing new in the semantic kernel.

## Mission

Make two REAL host-backed AI project principals live inside the G10-P federation, and reconcile/prune
infrastructure created before Ordarium v1.3.1. G10-P proved a durable organizational protocol; G10-Q
must prove that real persistent AI principals autonomously consume it.

Correct order: Semantic Closure → Product Closure → Operational Federation → **Real Cognitive
Dogfood** → Empirical Organization Evaluation. Empirical Evaluation is deferred to G10-R until real
cognitive-operation evidence exists.

## Non-negotiables

- **Anti-waste audit is a load-bearing deliverable**, not advisory: classify every accumulated seam,
  adapter, poller, cursor, test scaffold and deployment artifact as KEEP_SEMANTIC /
  KEEP_CONSUMER_STATE / BIND_PRODUCTION / DEMOTE_TEST_EMBEDDING / DELETE_REDUNDANT / DEFER_TRIGGERED.
  `DELETE = none` is a legitimate, evidenced outcome; cleanup must never become a semantic rebase.
- **Structural adapters are not enough**: the golden proof must run through a real host; no mock
  agents service, no recording/null attention adapter, no in-process boundary bridge on the
  production path.
- **Two real OS processes**, two real persistent principals, different host session/agent identity,
  different workspace, different PeerRef, different PersistentPoint, different local semantic DBs.
- **No shared hidden cognition**: no single model context as two peers, no shared transcript, no
  central planner. Shared only: transport substrate, accepted boundary state, commitments, explicit
  semantic messages.
- **Real attention activation**: durable fact → AttentionSignal → chosen host adapter activates/cold-
  resumes the principal → the agent reads canonical inbox/tool state → decides locally.
- **Real Agent uses the product tools**; the harness may launch/kill/restart/inject faults/collect
  telemetry, but must NOT script accept/reject/counter-propose decisions.
- **No chain-of-thought capture**: record tool calls, semantic messages, boundary candidates,
  commitment transitions, host activations, final visible responses only.
- Remote requests must never create Work in the other project; only the agent may create local Work.
- `SessionRef ≠ PeerRef ≠ PersistentPointId ≠ RuntimeAgentRef`; restart/cold resume keeps
  PeerRef/PersistentPoint unchanged and never promotes a host session id into peer identity.
- All cognitive telemetry (tokens, latency, turns, tools, model) is NONCANONICAL.
- No autonomous merge requirement: human merge approval is a permitted constitutional control.

## Exit criterion

> Two real host-backed persistent project principals, each with different repository context, durable
> PeerRef/PersistentPoint identity and host session state, can be activated or cold-resumed by
> Palimpsest attention, read their canonical semantic inbox through the product tools, autonomously
> reject/counter-propose/accept shared boundary state and commitments, survive restart and duplicate
> attention, and complete a real cross-project collaboration without a human relaying messages or a
> central planner. The production path is Ordarium-v1.3.1-backed, while obsolete/pre-v1.3.1
> scaffolding has been explicitly retained, demoted, or deleted through a documented anti-waste
> reconciliation.

PARTIAL if the dogfood uses null/recording attention, a human relays messages, one hidden LLM context
plays both peers, agents do not use real tools, decisions are scripted, only one process exists
despite host support, production docs still recommend fake adapters, the anti-waste audit is missing,
or duplicated infrastructure is left as a competing default. STOP — SEMANTIC REBASE REQUIRED if
SessionRef must become PeerRef, host wake must gain semantic authority, tools need raw-store bypass,
two principals need a global manager, truth ownership is duplicated, or the host API cannot support
persistent/cold-resume operation without a clean adapter boundary.
