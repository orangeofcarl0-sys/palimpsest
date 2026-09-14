# G10-P — Live Federated Workforce & Attention Loop (Campaign)

Stage nature: **operational federation / host-integration closure**. Not a new ontology campaign,
not Empirical Organization Evaluation, no new semantic kernel.

## Implementation topology (as executed)

| Step | Deliverable |
| --- | --- |
| P0 | Current-state + Ordarium v1.3.1 audit → `audits/G10-P-LIVE-FEDERATION-ASSESSMENT.md` |
| P1 | CF-O-01…10 disposition → `audits/G10-P-O-CARRY-FORWARD-DISPOSITION.md` |
| P2 | Ordarium 1.2.0 → 1.3.1 (package.json + `pnpm-workspace.yaml` overrides, all four packages) + migration proof |
| P3 | `src/deployment/` typed profile + `launchDeployment` + `palimpsest serve --profile` (closes CF-O-02) |
| P4 | `src/transport/` durable Ordarium transport + cursor store + inbound pump |
| P5 | Cursor/restart/idempotency closure (checkpoint-after-ingest; epoch fail-closed) |
| P6 | `src/attention/` deterministic semantic attention + coalescing |
| P7 | Host activation adapters (DSH / Pi, structural) |
| P8 | PeerRef ↔ PersistentPoint install wiring |
| P9 | Commitment enumeration read port + federation/application/HTTP/tool/projection wiring (closes CF-O-01) |
| P10/P11 | Two-peer live harness + golden path (offline/restart/duplicate/counterproposal/release) |
| P12/P13 | Dogfood runner + `audits/G10-P-DOGFOOD-EVIDENCE.md` |
| P14 | Adversarial/source-firewall/backcompat + docs + build + build:web + e2e + CI |

## Live architecture

```
Host deployment profile (host binding only)
  localPeer · persistentPoint · repository · DB paths · transport namespace · attention adapter · host session
        ▼
installPalimpsest (existing semantics; no new kernel)
  ├── federation  ── outbound send/wake via Ordarium Safe Actions → durable transport port
  └── canonical boundary home (when this host holds the store)
        ▲
inbound pump (source-firewalled: imports a structural federation/boundary seam, no store)
  StateChangeFeed(changes) → re-read exact StateRecord → STRICT envelope parse
     → federation.recordInboundMessage / accept|reject|releaseCommitment / boundary home
     → deployment-local cursor checkpoint
        ▼
attention derivation (deterministic, from canonical state) → AttentionSignal
        ▼
host activation adapter (DSH resume/followUp · Pi sendMessage triggerTurn) — Notification ≠ Activation
```

## Two-peer dogfood topology

- Peer P = Palimpsest project principal (`peer-palimpsest`, `pp-palimpsest`).
- Peer O = Ordarium project principal (`peer-ordarium`, `pp-ordarium`).
- Shared: one durable transport ledger + namespace (`dogfood`).
- Separate: orchestration / Ordarium effects / coordination / boundary / runtime-scope / cursor /
  attention-marks databases, semantic inboxes, local application instances — genuine different
  lived state.

## Golden path proven (spec §69)

P detects a dependency → durable message while O offline → O restart + durable replay → one
semantic message → duplicate delivery converges → O counter-proposes a boundary candidate accepted
durably by P's canonical home → joint acceptance → P offers a commitment scoped to the accepted
revision → O accepts explicitly (typed durable operation) → O implements + publishes a completion
notice → holder explicitly releases → verification that a notice alone never closes a commitment →
both restart and reconstruct state identically → no central planner anywhere.

## Mapping to machine invariants

| Invariant | Where proven |
| --- | --- |
| P-A01/P-A02 PeerRef + PersistentPoint stable | `p_live_federation` continuity test |
| P-A03/A04 transport ≠ collaboration truth | `p_adversarial`, `p_transport` |
| P-A05/A06 notification ≠ activation; wake ≠ authority | `p_attention` host adapter tests |
| P-A07 message ≠ commitment | `p_live_federation` (notice ≠ closure), `p_adversarial` |
| P-A10 remote request cannot assign Work | `p_live_federation` (0 task nodes) |
| P-A11/A12 at-least-once converges; duplicate ≠ duplicate event | `p_transport`, `p_live_federation` |
| P-A13/A14 crash windows | `p_transport` (lost checkpoint, malformed fail-closed) |
| P-A15 offline peer later receives | `p_live_federation` |
| P-A16/A17 local identity not caller-supplied | `p_transport` adapter test |
| P-A19/A20 deployment config ≠ authority/species | `p_deployment` strict parser |
| P-A21 no global planner | `p_adversarial` |
| P-A24 refusal/counterproposal | `p_live_federation` |
| P-A26 Work-only unchanged | `p_deployment` |
| P-A28 cursor contract respected | `p_transport` (future cursor, epoch) |
| P-A29 application surface is the façade | `p_live_federation`, `p_deployment` |
| P-A30/A31 production stores only, no raw backdoor | `p_adversarial` |
| P-A32 commitment edges honest | collaboration projection assertion |
| P-A33 CLI profile exposes advanced application | `p_deployment` CLI spawn test |
| P-A34/A35 attention failure loses nothing; pull mode works | `p_attention` |
| P-A39 CF-O items disposed | `G10-P-O-CARRY-FORWARD-DISPOSITION.md` |
| P-A40 required CI green | delivery doc |

## Constraints respected

No new global planner/manager/scheduler; no new identity species; no second truth store; frozen
contracts not edited to make tests pass; no effect authority introduced; Ordarium stays mechanical;
the application surface stays the only semantic façade; required CI green before merge. The only
frozen-adjacent test edits are the Ordarium ledger schema fixture (v3 → v4, an expected consequence
of ORD-BOOT-0) and additive service signatures with defaults.
