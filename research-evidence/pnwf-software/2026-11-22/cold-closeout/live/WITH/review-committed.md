# Cold handover maintenance review

Readback decision: READY

The earlier HOLD was based on an UNKNOWN cold-session lookup and an unresolved release-verification question. A fresh same-SHA readback at the owner-accepted revision `95b83e71ee9a37041b9918b5e8b797eebabf69c9` (receipt `ddb78305f10c5822f69b0c0ac2e7b94ef3921b0c6ebd308b28f56d1b39245fc4`) now finds the old Episode with no open questions and binds its verification note to that accepted tree. The prior blocker is therefore stale for maintenance handover. This is a handover-readiness decision only, not release authorization.

## Basis and reconciliation

- **Current accepted revision:** `95b83e71ee9a37041b9918b5e8b797eebabf69c9`, accepted through Work `DIRECT_BASIS` event 8 (approval event 7). The tree at this SHA is the version reviewed here.
- **Old record:** Episode `episode-e7050e9ddf64ccebde7f08f6` remains a historical DELIVER conclusion recorded at project revision 1 and former head `fbeb8958f4405688b13f37dbdec330157a660ab0`. The new readback finds it as `REOPENED`, not `UNKNOWN`: later project and head movement reopened it, so it is not itself the current acceptance. Its old outcome and artifacts remain preserved; it is not being rewritten or treated as fresh authority.
- **Relationship to the accepted version:** the accepted revision is the later direct correction commit. The old Episode describes the earlier basis, while the owner's current `DIRECT_BASIS` acceptance is bound to `95b83e7`. The readback reports `workPreserved: true` and `journalPreserved: true`.
- **Verification record status:** `journal:pje-d0c977aae7bb8bfeca9159f76e14a7d1` ("Fleet rollout verification") is present with standing `OBSERVED_SOURCE` and is returned by the readback as its `verificationNote`. It records the independent release verifier's observation that explicit zero and omitted limits returned zero frames before the change and three readings in source order in the accepted tree. It is bound to commit `95b83e7` and has no reopen conditions.
- **Current evidence:** the same-SHA readback reports the Episode found, 0 open questions, all four artifact digests matching `95b83e7` (`service/grpc_server.js`, `test/integration.test.js`, `test/server.test.js`, `MIGRATION.md`), `publicTests: 18`, `workPreserved: true`, and `journalPreserved: true`. I reran `node --test` on the reviewed tree: 18/18 tests passed. `git diff --stat 95b83e7..HEAD` is limited to this review file.
- **Scope caveat:** `proto/energy.proto` remains byte-for-byte unchanged; its released comment is stale by design, as documented in `MIGRATION.md`. The effective accepted behavior is the dated Fleet correction. READY means the maintenance handover can proceed on this evidence; it does not approve a release or broaden the accepted scope.

## Retained evidence

- Archived cold-session lookup: episode-e7050e9ddf64ccebde7f08f6, UNKNOWN, call call_ccfc97275a064338a47c1acb.
- Owner-accepted tree: 95b83e71ee9a37041b9918b5e8b797eebabf69c9, Work DIRECT_BASIS event 8.
- Original release verification reference: pje-d0c977aae7bb8bfeca9159f76e14a7d1.
- Fleet source: updates/2026-11-10/fleet-default-limit.md.
- Retained verification: zero or omitted limit returns the first three available readings. Positive limits, unary, wire compatibility and REST remain in scope for preservation.
- Fresh same-SHA readback: receipt ddb78305f10c5822f69b0c0ac2e7b94ef3921b0c6ebd308b28f56d1b39245fc4, found=true, state=REOPENED, openQuestions=0, publicTests=18, workPreserved=true, journalPreserved=true.
- Independent re-run: `node --test` 18/18 passed on the reviewed tree; only `MAINTENANCE-REVIEW.md` differs from `95b83e7`.

This review is for maintenance handover; it is not release authorization.
