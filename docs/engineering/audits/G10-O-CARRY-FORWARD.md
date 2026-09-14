# G10-O CARRY-FORWARD Register

Mandatory input for the next stage. No `BLOCKER_IN_O` remains.

```text
P1 — important: CF-O-01, CF-O-02
P2 — deferred / evidence-triggered: CF-O-03 … CF-O-10
```

## CF-O-01 — Collaboration graph omits commitments
- **ID:** CF-O-01 · **Observed at:** `src/application/surface.ts` (`projections.collaboration`)
- **Evidence:** the collaboration projection derives peers from the inbox and workspaces from a
  read-only boundary workspace port; commitment edges require enumerating commitments, which no
  read port exposes. `commitments: []` is passed honestly.
- **Category:** PROJECTION · **Concrete trigger:** a commitment enumeration read port. ·
  **Blocking:** NON_BLOCKING

## CF-O-02 — CLI `serve` is Work-only
- **ID:** CF-O-02 · **Observed at:** `src/cli.ts` (`new ProjectController`) + `serveOrchestration`
- **Evidence:** advanced application routes require a host to pass `installed.application`; the CLI
  keeps its legacy Work-only face.
- **Category:** HOST · **Concrete trigger:** a CLI flag to install advanced surfaces for `serve`. ·
  **Blocking:** NON_BLOCKING

## CF-O-03 — Layout/positions are ephemeral
- **ID:** CF-O-03 · **Evidence:** MultiGraph node positions are computed per render; no persisted
  presentation preferences. · **Trigger:** a user needing stable saved layouts. · **Blocking:** NON_BLOCKING

## CF-O-04 — Inspector depth
- **ID:** CF-O-04 · **Evidence:** the inspector shows canonical ref/state/kind; per-species rich
  details (declared interactions, membership revisions, verification provenance) are not yet
  rendered. · **Trigger:** deeper debug workflows. · **Blocking:** NON_BLOCKING

## CF-O-05 — Boundary/Campaign/Institution inspectors are minimal
- **ID:** CF-O-05 · **Evidence:** boundary/membership are exposed via tools/routes; the MultiGraph
  UI surfaces boundary capture only through the collaboration safe-action panel.
- **Trigger:** an operational boundary/membership console. · **Blocking:** NON_BLOCKING

## CF-O-06 — No WebSocket/SSE push
- **ID:** CF-O-06 · **Evidence:** the web debugger polls on demand; no push channel or change feed.
- **Trigger:** operational resilience / live multi-client sync. · **Blocking:** NON_BLOCKING

## CF-O-07 — Multi-tenant local identity
- **ID:** CF-O-07 · **Evidence:** one server carries one installed local peer; a per-request actor is
  never accepted. · **Trigger:** a host serving several sovereign local peers. · **Blocking:** NON_BLOCKING

## CF-O-08 — Campaign/evolution mutation surfaces
- **ID:** CF-O-08 · **Evidence:** campaign is read-only in the application surface; organization
  evolution mutation is exposed only when an evolution service is wired (absent in a bare install).
- **Trigger:** a governed organization-evolution console. · **Blocking:** NON_BLOCKING

## CF-O-09 — Reasoning branch execution remains host-side (CF-N-03)
- **ID:** CF-O-09 · **Trigger:** a standard host branch-runner seam. · **Blocking:** NON_BLOCKING

## CF-O-10 — Projection digest is a read-model digest only
- **ID:** CF-O-10 · **Evidence:** `projectionDigest` identifies a rendered projection, never a new
  semantic identity; no cross-session projection cache exists.
- **Trigger:** projection caching/ETag support. · **Blocking:** NON_BLOCKING

---
```text
No BLOCKER_IN_O. Next-stage candidates (spec §96):
  Empirical Organization Evaluation · Federated Boundary Operational Resilience ·
  Multi-Institution Governance · ReasoningCell → Campaign/Evidence publication ·
  ReasoningCell runtime/Holon packaging · DSH/Pi host integration
```
