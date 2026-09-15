# G10-U Real Extraction & Selective Disclosure — Evidence

Reproduce: `pnpm run build && node scripts/proof/real-extraction-e2e.mjs`
and `node scripts/proof/selective-disclosure-e2e.mjs`. Evidence: `.dogfood/g10u-real-extraction-e2e.json`,
`.dogfood/g10u-selective-disclosure-e2e.json`. All fixtures are synthetic; no real personal data.

## Real DSH evidence-grounded extraction (closes CF-T-02)

```text
result: PASS   (elapsed ~71.5s)
branches: 2 real DSH ephemeral branches executed; candidates submitted 2; admitted reasoning claims 2
evidence ids cited (exact): pev-5048b3… , pev-f171bd…   (match the allowlist exactly)
refs subset-of allowlist: true
adversarial: a branch payload citing unrelated pev-026871e5… → analysis BLOCKED and
             assertEvidenceRefsAllowlisted threw EvidenceAllowlistViolation
publication: unchanged Proof verification + separate admission → 2 published `pc-…` claims SUPPORTED
ProofAssetView supporting evidence: both allowlisted ids
new PeerRefs: 0   new PersistentPoints: 0
```

The branch is an ephemeral host cognition: it receives only the frozen brief plus the evidence-bound
context (objective, accepted frontier refs, allowed evidence ids, selected content) and may submit one
candidate with `externalEvidenceRefs`; the host and the extraction service both enforce refs ⊆ allowlist,
and it can neither verify nor publish.

## Byte-level selective disclosure (closes CF-T-03)

```text
result: PASS
materials: 2 evidence excerpts + manifest.json  (exactly 3 files)
TEXT_RANGE  → evidence-<id>.txt  content === "PUBLIC DEGREE LINE"
JSON_POINTER→ evidence-<id>.json content deep-equals the selected /education value
private tokens absent from every written byte: PRIVATE EMPLOYMENT LINE, PRIVATE FINANCIAL LINE,
  employer, role, ref, balance, iban, "employment", "financial"
no whole-source file written for the excluded sources; preview.materials deep-equals manifest.materials
preview alone and pre-approval export wrote nothing; invalid selector → blocked, zero files
restart: history + materials reconstruct
```

## Browser Proof Vault flow (closes CF-T-01)

`e2e/proof-vault.spec.ts` drives the real installed application: open Proof Vault → Sources empty state
(verbatim "Importing stores the source locally and does not send it to a model. Analysis is a separate
explicit action.") → import synthetic `degree.txt` → inspect revision → create EvidenceItem → Proof
Assets list/detail showing SUPPORTED + the Why chain → import `rev1` → the asset becomes **STALE** with an
explanation → Disclosure selects the education proof → Preview shows the exact excerpt file → **separate**
Approve & Export → history shows `EXPORTED`. The spec asserts that no Send/Share/Upload/Email/Delivered/
Received/Accepted wording and no score are rendered.

## Privacy posture observed

Import makes no model call; branch content access is selector-limited; no raw source in logs or error
bodies; the source list is metadata-only; raw content is read only through an explicit authenticated
endpoint; export is local-only with a separate approval; receipts say EXPORTED, never delivered.
