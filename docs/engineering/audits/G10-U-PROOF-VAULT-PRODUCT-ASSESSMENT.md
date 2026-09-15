# G10-U Proof Vault Product Assessment (U0)

Baseline: `main @ 565e2ff9992e5a12aec595e692cb647a798f5efd`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Browser / HTTP today

- The web app is a flat `web/src/**` with ONE surface switch (`App.tsx`: `"work" | "multigraph"`);
  `api.ts` exposes a single `call<T>(path, init)` helper (bearer token from localStorage
  `palimpsest-token`) plus typed helpers. **There is no proof/disclosure helper and no Proof Vault UI.**
  The e2e harness already has an advanced-surface boot pattern (`e2e/multigraph.spec.ts` `startO()`:
  `installPalimpsest` from `dist/src/advanced.js`, then `serveOrchestration(..., { application })`,
  token via `page.addInitScript`).
- Body limit is `BODY_LIMIT_BYTES = 1_000_000` in `src/serve.ts`; `readBody` accumulates UTF-8 text and
  destroys the request past the limit. Proof import/read currently use **base64 JSON** (`POST
  /api/proof/sources/import` takes `content` base64; `read_explicit` returns base64), so the effective
  raw ceiling is ~750 KB. There is no multipart/octet-stream route and no raw-content logging.
- `GET /api/proof/sources` returns source metadata only (metadata-only list is already honored).

## Why real DSH branches lose evidence ids (CF-T-02)

`externalEvidenceRefs` is fully supported in the lower layers (service input, artifact, application
`submitCandidate`, and `proof_asset/reasoning_bridge.ts` reads them as `supportingEvidenceIds`). It is
lost at the handoff because **nothing in the branch/tool chain can supply it**:

1. `palimpsest_reasoning`'s tool schema (`src/tools/application_tools.ts`) has no `externalEvidenceRefs`
   property, and `argsObject` rejects unknown args — the ephemeral agent literally cannot pass it.
2. The frozen `ReasoningBranchBrief` (objective/question/frontier/acceptedClaims) carries **no evidence
   at all**, so the branch is not told which EvidenceItems exist.
3. `host/dsh/lib/runner.js` `branchTask` never mentions evidence.
4. `src/recipes/execution.ts` EXPLORE submits `{cellId,branchId,type,content}` with no refs, and the
   branch outcome carries only `statement`/`candidateDigest`.
5. `POST /api/reasoning/candidate` also omits refs.

Therefore every branch candidate's `externalEvidenceRefs` is `[]`, and a Proof candidate prepared from it
is unverifiable/unpublishable.

## Why disclosure exports whole sources (CF-T-03)

`EvidenceSelector` supports `WHOLE_SOURCE | TEXT_RANGE | JSON_POINTER`, and `recordEvidence` computes the
exact `selectionDigest` from the resolved selection. But:

- `DisclosureEvidenceRef` carries only `{evidenceId}` — the **selector is not in the preview/bundle**.
- `DisclosureBundle` has no per-evidence selector and **no `materializationKind`**.
- `localDisclosureExporter.export` iterates `bundle.sourceRevisionRefs` (whole revisions) and writes the
  entire blob; the module's own comment admits excerpts "cannot be reconstructed from the bundle alone".

So the manifest cannot even express "excerpt", and preview/export cannot be byte-level minimal.

## U0 decisions

- Close CF-T-01/02/03 in U; keep CF-T-04 (remote disclosure), CF-T-05 (independent verifier), CF-T-06
  (erasure), CF-T-07 (person identity), CF-T-08 (external connectors) trigger-driven.
- The extraction handoff gains an **execution-layer** `EvidenceBoundReasoningContext
  {allowedEvidenceRefs, sourceAccessPolicy, selectedContent}` carried in the brief and enforced
  STRUCTURALLY (candidate refs must be a subset of the allowlist) — not by prompt alone. It is NOT
  ReasoningCell canonical truth and does not change Branch identity.
- Disclosure manifests gain per-evidence `selector` + `materializationKind` (`ORIGINAL_SOURCE |
  TEXT_EXCERPT | JSON_VALUE`) and a computed excerpt digest; the exporter materializes by selector and
  **never falls back** to whole source on a selector failure.
- The UI is a new derived surface over the typed application/HTTP surface: no direct SQLite, no blob-path
  reads, no hidden filesystem access; raw content only via an explicit endpoint; MultiGraph stays the
  advanced debugger. No health/truth score anywhere.
