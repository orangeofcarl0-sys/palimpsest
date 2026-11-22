import { isDeepStrictEqual } from "node:util";
import { receiptId } from "./tools.mjs";

/** Entry names and expectations are sealed before the first Mock session. */
export function grade(contract, evidence) {
  const { direct, pending, resumed, receipt, sourceSha256, controls } = evidence;
  const checks = {};
  const check = (name, passed) => { checks[name] = Boolean(passed); };
  const matches = (row, expected) => isDeepStrictEqual(row,
    ["便携记录器", expected.choice, expected.status, expected.minutes, expected.evidence]);
  const actions = (run) => run.calls.map((call) => call.args.action);
  check("the three business prompts are byte-identical", [direct, pending, resumed].every((run) => run.goal === contract.goal));
  check("three distinct DSH sessions and homes", new Set([direct, pending, resumed].map((run) => run.sessionId)).size === 3 &&
    new Set([direct, pending, resumed].map((run) => run.home)).size === 3);
  check("local blind runtime has no Git or A2A", controls.noGit && controls.transportDisabled && controls.noTransportFiles);
  check("all sessions naturally complete on the local Mock with full accounting", [direct, pending, resumed].every((run) =>
    run.exitCode === 0 && run.ledger.requests > 0 && run.ledger.unresolved === 0 &&
    run.ledger.requests === run.mockRequests && run.calls.every((call) => call.actualCall !== null && call.actualResult !== null)));
  check("sufficient evidence took the direct path", matches(direct.final.logger, contract.expected.direct) &&
    !actions(direct).includes("request_review") && direct.review === null);
  check("open evidence gap produced a provisional draft and a real request", matches(pending.final.logger, contract.expected.before) &&
    pending.review?.state === "PENDING" && pending.review.checkpointId === pending.saved.id &&
    actions(pending).filter((action) => action === "request_review").length === 1);
  check("normal cold restore recovered identical workbook bytes", controls.missingDraftAfterStop &&
    resumed.restored?.id === pending.saved.id && resumed.restored.digest === pending.final.digest &&
    resumed.before?.draft.digest === pending.final.digest && isDeepStrictEqual(resumed.before.draft.logger, pending.final.logger));
  check("cold DSH saw the same pending review", resumed.before?.review.state === "PENDING" &&
    isDeepStrictEqual(resumed.before.review, pending.review) && controls.pendingObservedBeforeReceipt);
  check("the returned receipt is scoped to the actual request, draft and distinct role", receipt.requestId === pending.review?.id &&
    receipt.checkpointId === pending.saved.id && receipt.reviewer === "bench-custodian" &&
    receipt.sourceSha256 === sourceSha256 && isDeepStrictEqual(receipt.measurement, contract.held));
  const { id, ...body } = receipt;
  check("receipt identifier binds the observed content", id === receiptId(body));
  check("the version-bound evidence changed the actual logger recommendation",
    matches(resumed.final.logger, { ...contract.expected.after, evidence: id }) &&
    resumed.final.logger[1] !== resumed.before?.draft.logger[1] && resumed.final.digest === resumed.saved.digest &&
    resumed.saved.id !== pending.saved.id && actions(resumed).indexOf("read_receipt") < actions(resumed).indexOf("write_recommendation"));
  check("the affected question closed with evidence and the unrelated scanner row stayed", resumed.review?.state === "RESOLVED" &&
    resumed.review.id === pending.review?.id && [direct, pending, resumed].every((run) =>
      isDeepStrictEqual(run.final.scanner, contract.expected.retainedRow)));
  check("accepted workbook and original sources remained byte-identical", controls.protectedFilesUnchanged && controls.noReviewerDraftWrite);
  check("wrong version, conflicting draft and scope escape were refused", controls.wrongCheckpoint && controls.conflictingFile &&
    controls.outOfScope);
  return { pass: Object.values(checks).every(Boolean), checks };
}
