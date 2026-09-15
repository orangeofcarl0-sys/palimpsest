# G10-T Proof Asset Layer & Personal Data Proof Vault — Delivery

Baseline: `main @ 735f54d6935b71f681ff97aa1413687baf53dfad`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Delivered

| Area | Files |
| --- | --- |
| Proof plane core | `src/proof_asset/{refs,sources,evidence,claims,verification,store,service,blob}.ts` |
| Bridges + disclosure | `src/proof_asset/{reasoning_bridge,campaign_bridge,source_content_port,disclosure,index}.ts` |
| Product surface | `src/install.ts`, `src/application/{surface,http}.ts`, `src/tools/application_tools.ts`, `src/advanced.ts` |
| Tests | `test/t_proof_asset.test.ts` (21), `test/t_disclosure.test.ts` (9), `test/t_adversarial.test.ts` (8) |
| E2E | `scripts/proof/proof-vault-e2e.mjs` |
| Docs | T0 assessment, CF-S disposition, privacy/security boundary, product-claims audit, spec, campaign, evidence, carry-forward, this delivery |

## Golden proofs

- **Reasoning → Proof**: an ACTIVE admitted ReasoningCell claim cannot auto-publish; `preparePublication`
  yields a candidate while **no EvidenceClaim exists yet**; verification then a SEPARATE admission then
  publish yields a NEW claim id distinct from the reasoning claim id; an inactive reasoning claim is
  blocked.
- **Campaign bridge**: `inspectClaim` returns a `known ClaimStandingSnapshot` with a derived digest;
  Campaign reads it and cannot mutate the proof plane.
- **Freshness/dependency**: a newer `degree.txt` revision leaves base standing SUPPORTED but effective
  standing STALE; a dependent claim becomes effectively STALE; history is retained.
- **Selective disclosure**: an education-only preview includes the degree claim/evidence and excludes
  employment/financial ids; excluded bytes are absent from the export; preview alone exports nothing;
  APPROVE + export writes `manifest.json` + the selected source and records a local EXPORTED receipt.
- **Restart**: close/reopen reconstructs sources/revisions/evidence/candidates/verification/publication/
  assessments/disclosure previews+receipts (27 chain events, 1 preview, 1 receipt).

## Local gates

| Gate | Result |
| --- | --- |
| `pnpm run build` | PASS |
| `pnpm exec vitest run` | PASS — **139 files / 1237 tests** (baseline 136 / 1199) |
| `pnpm run build:web` | PASS (web unchanged) |
| `node scripts/proof/proof-vault-e2e.mjs` | PASS — 10/10 milestones, restart reconstruction |

## Deviations (honest)

1. The vertical E2E used a **deterministic** ReasoningCell extraction path (`dshUsed:false`): a real
   `makeReasoningCellService` with a real event chain and scripted verification/admission policies. A
   real DSH ephemeral branch submits its own candidate without the proof-plane `evidenceId` in
   `externalEvidenceRefs`, so its claim could not be verified/published; wiring that link is CF-T-02.
   Real DSH branch execution itself was proven in G10-S.
2. No Proof Vault Web vertical (API/tools only) — CF-T-01.
3. Disclosure export reconstructs whole source files; sub-range / JSON-pointer excerpts are not yet
   materialized as separate excerpt files (CF-T-03).
4. `0600`/`0700` file modes are best-effort on Windows; no encryption-at-rest is claimed (none exists).
5. `DISCLOSURE_*` events were added to the proof store for durability; own-freshness now feeds effective
   standing (base standing is still retained).

## Required CI

See the canonical gate recorded after the implementation PR run (filled in the closure commit).
