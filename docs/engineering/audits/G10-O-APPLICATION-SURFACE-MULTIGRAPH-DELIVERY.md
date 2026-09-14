# G10-O Unified Application Surface & MultiGraph Debugger — Delivery

Baseline: `main @ d1e128e`. Verdict: **PASS** (see the final campaign report).

## What shipped

| File | Change |
|---|---|
| `src/application/surface.ts` (new) | `PalimpsestApplicationSurface` + all sub-surface façades; identity derived; only read-only + high-level-safe mutations |
| `src/application/projection_types.ts` / `projections.ts` (new) | typed per-species projection envelopes + work/organization/collaboration/runtime/reasoning projections |
| `src/application/http.ts` (new) | strict namespaced application routes + honest error→status mapping |
| `src/application/index.ts` (new) | advanced barrel |
| `src/tools/application_tools.ts` (new) | ten cohesive strict agent tools |
| `src/tools/index.ts` | exports `defineApplicationTools` |
| `src/federation/federation_service.ts` | additive read-only `commitmentState` |
| `src/serve.ts` | additive optional `application` → typed routes (legacy face unchanged) |
| `src/install.ts` | builds the surface, registers application tools only when a surface exists, exposes `installed.application`, adds `organizationDynamicsPolicy` |
| `src/advanced.ts` | exports the application layer + tool factory |
| `web/src/MultiGraphView.tsx` (new), `web/src/api.ts`, `web/src/App.tsx` | MultiGraph shell, typed inspector, governed safe actions, top-level switcher |

## Machine invariants

| Invariant | Proof |
|---|---|
| APP-A01/A36 application layer introduces no canonical DB | source firewall: no `*store.js` import, no `appendAtomic`/`registerRevision`/`applyStructuralTransition` in http/projections/tools |
| APP-A02/A13 all product entries share one high-level surface | tools and HTTP call the same façade; boundary + reasoning vertical tests |
| APP-A03 ProjectController stays Work-scoped | controller imports no advanced module (source firewall) |
| APP-A04/A34 old nine Work tools preserved; Work-only install stays functional | exact tool-name assertion + absent advanced surfaces + 501 |
| APP-A05/A23 absent optional service → absent tool/route, not fake empty | partial-install matrix + `/api/application/surfaces` honesty |
| APP-A06/A07/A16 caller cannot self-assert identity/authority | no such tool parameters (schema assertion) + unknown-field rejection |
| APP-A08/A09/A10 no VerificationResult/AdmissionDecision/evolution-authority injection | schemas expose none; the service invokes the ports |
| APP-A11/A12 no raw store append; no generic tunnel | route/source firewalls; `/api/advanced` is not a route |
| APP-A14 server auth ≠ semantic authority | token gates the server only; semantic errors are 403/409 from kernels |
| APP-A15/A17/A18/A19 MultiGraph ≠ canonical graph; no UniversalNode; layout/delete changes zero truth | projection envelope types + source firewall + presentation-id-only renderer |
| APP-A20 semantic mutation requires an explicit high-level action | only `evaluate`/`decide` verbs exist in the UI |
| APP-A21/A22/A24 projections carry provenance and honest knowledge/staleness | envelope `sourceBases` + `knowledge` + unknown-org and error-work tests |
| APP-A25…A32 message≠agreement, acceptance≠commitment, runtime parent≠manager, candidate≠admitted, no CoT field, dynamics stays vector-valued, org def ≠ runtime actor set, focus≠authority | distinct edge/node kinds, `state` labels, no CoT field anywhere, no scalar-score rendering |
| APP-A33/A35 restart/partial installs compose | partial-install matrix (fresh stores each time) |
| APP-A37 no global manager/planner | source firewall |
| APP-A38 N carry-forward disposed | `G10-O-N-CARRY-FORWARD-DISPOSITION.md` |
| APP-A39/A40 required CI green before merge; canonical regression green | 124 files / 1079 unit tests; build/build:web; e2e 23/24 (documented flake) |

## Adversarial matrix (covered)

Tool extra/unknown fields rejected; fake `localPeer` / `authenticated` / `from` rejected as unknown
arguments; no verification/admission/authority injection; raw event append impossible; raw store
mutation impossible; stale/unknown surfaced explicitly; HTTP wrong method → 400, unknown route →
not-an-application-route, malformed ref → 404, `/api/advanced` tunnel absent, unconfigured surface →
501; projection presentation ids collide harmlessly across species (distinct `ref.species`); drag/
delete are renderer-only; a pending reasoning candidate is not rendered as admitted; a runtime child
is not rendered as an organization subordinate (separate species); a message edge is not rendered as
a commitment (distinct `commitment_holder`/`commitment` semantics); a boundary accepted revision is
not rendered as evidence (no such projection).

## Honest deviations

- **O1–O11** ship as one implementation PR plus a docs-only closure PR.
- **CF-O-01**: the collaboration projection passes `commitments: []` because no commitment
  enumeration read port exists (documented, not faked).
- **CF-O-02**: the CLI `serve` path remains Work-only; advanced routes require a host to pass
  `installed.application` to `serveOrchestration`.
- **CF-O-04/05**: the typed inspector renders canonical ref/kind/state; per-species rich detail
  panels and a boundary/membership console are carry-forward.
- The web debugger polls on demand (no WebSocket/SSE).
- The browser E2E boots its own real-kernel server with an application; the legacy Work E2E specs
  continue to exercise the Work-only face.
