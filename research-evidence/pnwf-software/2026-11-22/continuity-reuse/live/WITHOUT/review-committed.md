# Cold handover maintenance review

Readback decision: READY

Ready for maintenance continuation at accepted tree `95b83e71ee9a37041b9918b5e8b797eebabf69c9`. This is a handover-readiness decision, not a release authorization.

The prior HOLD is superseded: its blocking condition was that the old Episode readback was `UNKNOWN`. The same-SHA cold readback has now been revalidated against `95b83e7`, and it resolves the Episode, its acceptance, the verification note and all recorded artifacts.

## Basis of decision

- Revalidated cold readback: receipt `ddb78305f10c5822f69b0c0ac2e7b94ef3921b0c6ebd308b28f56d1b39245fc4`, same-SHA readback at `95b83e71ee9a37041b9918b5e8b797eebabf69c9`, superseding prior archived call `call_ccfc97275a064338a47c1acb`. Result: Episode `episode-e7050e9ddf64ccebde7f08f6` found, state `REOPENED`, acceptance `DIRECT_BASIS` at `95b83e7` (event 8, approval event 7), verification note `journal:pje-d0c977aae7bb8bfeca9159f76e14a7d1`, open questions 0, `workPreserved: true`, `journalPreserved: true`, public tests 18.
- Artifact verification at the accepted SHA matches the recorded digests: `service/grpc_server.js` `c97e5fdfd725…`, `test/integration.test.js` `ab27a39846ae…`, `test/server.test.js` `056777719a07…`, and `MIGRATION.md` `62d76ebf8898…`.
- Current review branch HEAD `1444de6` is the accepted tree plus this review only: `git diff 95b83e7..HEAD` adds `MAINTENANCE-REVIEW.md` and changes no implementation, test, protocol or REST file.
- Test verification at the current HEAD: `node --test` passes 18/18, including the zero/omitted-limit default of three readings in source order, positive limits, unary reads, wire framing, unknown-site errors, unknown methods and the preserved REST baseline.
- Fleet source `updates/2026-11-10/fleet-default-limit.md` has blob `0951003a7d83af8591a151bf560da0f4bebe1150` at the accepted SHA, matching the blob recorded in the verification note.

## Old record and current accepted version

The old Episode record and the current accepted version refer to the same code revision, not divergent trees. The Episode conclusion (`journal:pje-ee0141283028401089832410680085bb`) was an advisory `DELIVER` conclusion recorded at basis head `fbeb895`, and it named `95b83e7` as the delivered correction. The project acceptance is `DIRECT_BASIS` at `95b83e7` (event 8, approval event 7), and the Fleet verification note is anchored to that same SHA. The review branch adds only this maintenance review on top.

The Episode is `REOPENED` because its conclusion basis predates the move to project revision 2 and head `95b83e7`, and because the later Fleet verification note was recorded after that conclusion. That is a freshness condition on the advisory conclusion, not evidence that the accepted tree changed or failed verification.

## Verification record status

`journal:pje-d0c977aae7bb8bfeca9159f76e14a7d1` is present and has standing `OBSERVED_SOURCE`. It records the source blob above, the verifier's before/after observation (explicit zero and omitted limits returned no frames before the change, and three readings in source order in the accepted tree), and confirms that the reviewed candidate and the accepted project version are both `95b83e7`. It records that there is no contributor decision for that run.

This is a verification record, not an accepted asset, promotion or release approval. The readback's `unknownControl: true` is likewise not a release grant. Release approval remains with the owner.

## Retained evidence

- Archived cold-session lookup: episode-e7050e9ddf64ccebde7f08f6, UNKNOWN, call call_ccfc97275a064338a47c1acb.
- Owner-accepted tree: 95b83e71ee9a37041b9918b5e8b797eebabf69c9, Work DIRECT_BASIS event 8.
- Original release verification reference: pje-d0c977aae7bb8bfeca9159f76e14a7d1.
- Fleet source: updates/2026-11-10/fleet-default-limit.md.
- Retained verification: zero or omitted limit returns the first three available readings. Positive limits, unary, wire compatibility and REST remain in scope for preservation.
