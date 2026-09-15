# G10-U Proof Vault Product Closure & Evidence-Grounded Extraction — Delivery

Baseline: `main @ 565e2ff9992e5a12aec595e692cb647a798f5efd`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Delivered

| Area | Files |
| --- | --- |
| Evidence-grounded extraction | `src/proof_asset/{materialize_selector,extraction}.ts`, `src/reasoning_cell/branch_execution.ts`, `host/dsh/lib/{startup,runner,index}.js` |
| Selector-aware disclosure | `src/proof_asset/disclosure.ts` (materials manifest + no-fallback exporter) |
| Product surface | `src/application/{surface,http}.ts` (`externalEvidenceRefs`, `POST /api/proof/analyze`), `src/tools/application_tools.ts` (`palimpsest_reasoning` refs + `palimpsest_proof analyze`), `src/install.ts` (`installed.proofExtraction`) |
| Web Proof Vault | `web/src/proof_vault/{ProofVaultView,parts}.tsx`, `web/src/api.ts` (16 proof/disclosure helpers), `web/src/App.tsx` (`"proof"` surface) |
| Tests | `test/t_disclosure.test.ts` (15 + CF-T-03 cases) and existing proof/recipe/adversarial suites |
| E2E | `e2e/proof-vault.spec.ts`, `scripts/proof/real-extraction-e2e.mjs`, `scripts/proof/selective-disclosure-e2e.mjs` |
| Docs | product assessment, CF-T disposition, spec, campaign, privacy-minimization assessment, product-claims audit, real-extraction evidence, carry-forward, this delivery |

## Golden proofs

- **CF-T-01 (web vertical)**: a browser Proof Vault (Sources / Evidence / Proof Assets / Disclosure /
  Analyze) driven only through the typed HTTP surface; the 13-step browser E2E passes and asserts no
  Send/Share/Upload/Email/Delivered/Received/Accepted wording and no score.
- **CF-T-02 (real DSH extraction)**: `analyzeEvidence` ran **2 real DSH ephemeral branches**; both
  candidates carried the EXACT Proof `evidenceId`s (`pev-5048b3…`, `pev-f171bd…`), refs ⊆ allowlist was
  enforced structurally (a branch payload citing unrelated `pev-026871e5…` was **blocked** and the shared
  guard threw), the real ReasoningCell admitted 2 claims, and explicit Proof verification + publication
  admitted 2 `pc-…` claims with base/effective standing SUPPORTED — with **0 new PeerRefs and 0 new
  PersistentPoints**.
- **CF-T-03 (true excerpt export)**: disclosure materials carry selector + `materializationKind` +
  excerpt digest; a TEXT_RANGE export wrote exactly `PUBLIC DEGREE LINE` and a JSON_POINTER export wrote
  exactly the `/education` value — with 9 private tokens (employment/financial lines, employer/role/ref/
  balance/iban, `"employment"`, `"financial"`) ABSENT from every written byte; an invalid range/pointer
  is **blocked** with no whole-source fallback; preview materials equal exported materials; restart
  reconstructs.

## Local gates

| Gate | Result |
| --- | --- |
| `pnpm run build` | PASS |
| `pnpm exec vitest run` | PASS — **139 files / 1243 tests** (baseline 139 / 1237) |
| `pnpm run build:web` | PASS |
| `pnpm exec playwright test` | PASS — **25 / 25** (incl. the new Proof Vault spec) |
| `node scripts/proof/real-extraction-e2e.mjs` | PASS |
| `node scripts/proof/selective-disclosure-e2e.mjs` | PASS (byte-level minimization) |
| `node scripts/proof/proof-vault-e2e.mjs` | PASS (updated to the materials layout) |

## Deviations (honest)

1. No `GET /api/proof/evidence?sourceId` enumeration route: the Sources detail lists evidence created in
   session plus evidence referenced by published claims, labelled as such (CF-U-01).
2. No model/provider metadata route, so the UI renders "model/provider: unknown" rather than naming a
   provider (CF-U-02).
3. `ProofApplicationSurface` exposes `preparePublication(cellId, claimId)` but not a freshness-policy
   setter; the browser E2E seeds a STALE-able asset through the canonical service over the same store as
   setup (CF-U-03).
4. The real-DSH negative case (a live model branch deliberately citing a foreign evidence id) was not
   forced because a model citation is not deterministic; the same enforcement seam is unit-tested with an
   injected off-allowlist payload.
5. Streamed/multipart upload is not implemented; browser import is base64 JSON bounded by the server's
   1 MB body limit (~750 KB raw) (CF-U-04).

## Required CI (canonical gate)

| Checkpoint | Value |
| --- | --- |
| Implementation PR | **#82** `experiment/g10-u-proof-vault` |
| Tested branch HEAD | `36c7a67` |
| PR run | `34946565653` — **unit pass + e2e pass on attempt 1** |
| Merge | `--merge` (normal) → canonical `main @ d10cb6e3249cdc16404bf8dd5693cadfa8ae1ffc` |
| Tree identity | `git diff 36c7a67 d10cb6e` empty → the tested tree IS the merged tree |
| Canonical main run | `34946808403` — **unit pass + e2e pass on attempt 1** |

All required checks were GREEN before merge; no force/bypass/history rewrite. The real-DSH extraction,
selective-disclosure and Proof Vault browser E2Es are separately reproducible artifacts.
