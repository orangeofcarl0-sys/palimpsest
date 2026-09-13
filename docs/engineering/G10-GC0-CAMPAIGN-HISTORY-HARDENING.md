# G10-GC0 — Campaign History Hardening

Status COMPLETE. Baseline `main` @ `126c11e`.

## appendAtomic retry semantics (§12–§17)

Before rejecting a stale expected basis, the store classifies the requested
event ids against canonical history:

- no requested event exists -> require `currentBasis == expectedBasis`, then append;
- ALL requested events already exist byte-semantically identical -> idempotent
  success (returns stored events; the expected basis may now be historical);
- SOME present -> `recovery_required` (never silently completed);
- any eventId present with different content -> `event_conflict`.

Event equivalence compares `campaignId`, `eventId`, `type`, and the STRICTLY
PARSED canonical payload (via domain-separated canonical digest), never raw
unordered JSON bytes. All-present retries still verify the full chain, so a
corrupt historical row can never be returned as a successful retry.

## Error taxonomy (§17)

`basis_mismatch`, `event_conflict`, `recovery_required`, `malformed_record`,
`database_busy`, `unknown_campaign`, `already_exists`, `invalid_registration` —
distinct, not collapsed.

## Parsers (§18–§25)

`parseProjectOperationalStanding` (strict enum), `parseCampaignWatchDraft`
(rejects unknown fields, calls `parseWatchCondition`), strict ClaimStatus and
evidence-id validation in `parseWorldSnapshot`, and the compiler WAIT path now
routes every watch draft through `parseCampaignWatchDraft` — malformed
conditions fail at candidate parsing, not later.
