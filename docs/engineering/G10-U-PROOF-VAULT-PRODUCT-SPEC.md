# G10-U — Proof Vault Product Closure & Evidence-Grounded Extraction (Spec)

Sources / Proof Assets / Disclosure UX + Real DSH Evidence Binding + True Excerpt Export.

Baseline: `main @ 565e2ff9992e5a12aec595e692cb647a798f5efd`. Local product closure + privacy
minimization + real-host extraction. Cross-app proof federation is deferred to G10-V.

## Firewalls

```
Web UI ≠ Proof canonical truth   Import ≠ Analyze   Analyze ≠ Verify   Verify ≠ Publish
Preview ≠ Export                 Browser auth ≠ Disclosure approval
Evidence context ≠ global agent memory   Evidence allowlist ≠ publication authority
ReasoningCandidate ≠ PublishedClaim
TEXT_RANGE export ≠ WHOLE_SOURCE export   JSON_POINTER export ≠ WHOLE_SOURCE export
Excerpt artifact ≠ SourceRevision   Local export ≠ remote disclosure   Local Proof Vault ≠ encrypted vault
```

## Product shape

```
Proof Vault
  Sources      explicit import (bounded, confirmed, no model call, no crawl) · metadata list · detail
               (revisions, EvidenceItems, provenance, model exposure, explicit content preview)
  Proof Assets list + detail (claim, base vs effective standing, freshness, Why? chain, dependencies)
  Disclosure   select claims + purpose + audience label → Preview (exact materials + warnings)
               → SEPARATE Approve & Export → local files + EXPORTED history
  Analyze      explicit pre-run exposure panel (evidence, source portions, model/provider or "unknown")
               → real DSH Explore branches constrained to an evidence allowlist → reasoning claim
```

## Evidence-grounded extraction (closes CF-T-02)

- `EvidenceBoundReasoningContext { allowedEvidenceRefs, sourceAccessPolicy: "SELECTOR_ONLY", selections }`
  is an **execution-layer** context (not ReasoningCell canonical truth) carried alongside the frozen
  `ReasoningBranchBrief`; Branch identity is unchanged.
- The branch tool surface now accepts `externalEvidenceRefs`; the ephemeral host task includes the
  allowlist and each selection's materialized text, and the host **structurally rejects** (non-zero exit,
  failed result) any candidate citing a ref outside the allowlist. The extraction service re-checks
  `refs ⊆ allowlist` before submitting.
- Branch content access is selector-aware: TEXT_RANGE → selected text only; JSON_POINTER → selected value
  only; WHOLE_SOURCE → explicit whole-source exposure. Branch prompt contains only the objective,
  accepted-frontier refs, allowed evidence refs and selected content — never the whole Vault, sibling
  pending candidates, or parent scratchpad.
- `analyzeEvidence` may run cognition but can never publish a ProofClaim or approve a disclosure.

## Selector-aware export (closes CF-T-03)

- The disclosure manifest carries per-evidence `selector` + `materializationKind`
  (`ORIGINAL_SOURCE | TEXT_EXCERPT | JSON_VALUE`) + materialized digest + file name, all inside the
  digest.
- The exporter materializes by selector (`evidence-<id>.txt` / `.json` / original blob) and **blocks**
  on any selector failure — it never falls back to whole-source bytes. Preview materials equal exported
  materials (parity).
- WHOLE_SOURCE remains whole with an explicit over-disclosure warning.

## Privacy / claims discipline

Import stores locally and makes no model call; analysis is a separate explicit action. UI is metadata
only; raw content only via an explicit endpoint. No raw source in logs/errors. No truth/legal/encryption
claim; no Send/Email/Upload/Share; receipts say EXPORTED, never Delivered/Received/Accepted. No
health/truth score; MultiGraph stays the advanced debugger.

## Exit criterion

> The Personal Proof Vault is a usable local product rather than an API-only semantic layer: users can
> explicitly import sources, inspect immutable revisions and evidence, view Proof Assets with
> standing/freshness/provenance explanations, run real DSH Explore extraction against an explicit
> evidence allowlist so resulting ReasoningCandidates carry the exact Proof EvidenceItem references,
> explicitly publish those claims through the unchanged Proof verification/admission path, and prepare
> local disclosures whose TEXT_RANGE/JSON_POINTER evidence is materially exported as the selected
> excerpt/value rather than the whole source. Browser access, model processing and disclosure approval
> remain separate, no raw source is globally injected into agent context, and no remote sharing is
> introduced.

PARTIAL if the Proof Vault is still API-only, real DSH extraction still loses evidence ids, a branch can
browse the whole Vault, Analyze auto-publishes, preview is minimal but export writes the whole source, a
selector failure falls back to whole source, the browser source list leaks raw content, model exposure is
hidden, or export bypasses separate approval.
STOP — SEMANTIC REBASE REQUIRED if evidence-grounded extraction requires ReasoningClaim identity =
EvidenceClaim identity, branch execution needs global Vault access, fine-grained disclosure requires
changing SourceRevision truth, the UI needs a second Proof truth store, or the product flow must bypass
publication/disclosure admission.
