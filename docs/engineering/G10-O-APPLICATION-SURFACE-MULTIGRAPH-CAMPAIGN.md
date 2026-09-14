# G10-O Campaign — Unified Application Surface & MultiGraph Organizational Debugger

Baseline: `main @ d1e128e`. Vertical/product closure (no new ontology).

## Stage topology (as executed)

```text
O0  Current-state audit (install/tools/server/web) + N carry-forward disposition
    → audits/G10-O-APPLICATION-SURFACE-ASSESSMENT.md
    → audits/G10-O-N-CARRY-FORWARD-DISPOSITION.md
O1  PalimpsestApplicationSurface (safe façades, optional wiring, ProjectController firewall)
    → src/application/surface.ts
O2/O3 Tool factories + cohesive application tools
    → src/tools/application_tools.ts
O4  Typed HTTP route registry
    → src/application/http.ts + src/serve.ts (additive `application` option)
O5  Typed MultiGraph projection layer
    → src/application/{projection_types,projections}.ts
O6/O7 Web MultiGraph shell + typed inspector + governed safe actions
    → web/src/MultiGraphView.tsx (+ api.ts helpers, App.tsx switcher)
O8-O10 Agent tool + HTTP parity + browser E2Es
    → test/o_application_surface.test.ts (10), e2e/multigraph.spec.ts (3)
O11 Adversarial / source-firewall / backcompat closure + docs + CI
```

## Test matrix

| Suite | Count | Focus |
|---|---:|---|
| `test/o_application_surface.test.ts` | 10 | Work-only backcompat (exactly nine tools, absent surfaces, 501), tool/surface inventory + strictness, identity/authority/verification/admission injection rejected, boundary mutation vertical (tool→application→truth + HTTP parity), reasoning vertical, typed route statuses + no tunnel, projection refs/knowledge/species semantics, pending candidate not admitted, source firewalls, partial-install matrix |
| `e2e/multigraph.spec.ts` | 3 | Real built stack: species switcher + typed projections + canonical-ref inspector + unknown-honesty; pending candidate not admitted and the UI safe action performs service-side verification/admission; typed route auth/absence + no generic tunnel |

Baseline before O: 123 files / 1069 unit tests; local e2e 21/21. After O: **124 files / 1079 unit
tests**; local e2e **23/24** (the single failure being the documented `E2E-DEBUG-01` flake);
`build` + `build:web` green.

## CI / merge discipline

Real exit codes / `gh run view --json conclusion` only; required checks must be GREEN before merge.
