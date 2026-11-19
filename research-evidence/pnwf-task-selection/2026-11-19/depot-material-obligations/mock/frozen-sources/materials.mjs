import {isDeepStrictEqual} from "node:util";
import {DatabaseSync} from "node:sqlite";
import {bindTaskObligations} from "../../../dist/src/schema/work_revision.js";
import {inspectWorkRevision,requireWorkRevision} from "../../../dist/src/work/revision.js";
import {git} from "../transit-desk/run.mjs";

export const basis = "341e19e288de9f561f85fcb66a7a910ff6f3e143";
export const receiptPath = "operations/duty-2340.json";
const deliverables = ["HANDOVER.md","shift-plan.json",receiptPath];
export const obligations = bindTaskObligations({
  schemaVersion:1, mayWrite:deliverables, mustChange:deliverables, mustExist:deliverables,
  mustPreserve:["README.md","TASK.md","model.mjs","model.test.mjs","night.json","operations/cold-cycle.json",
    "operations/desk.md","operations/retest.mjs","package.json"],
});

export function inspectFiles(world,candidate) {
  // Stable direct-delivery inspection identity. No governed Attempt is opened or settled.
  return inspectWorkRevision(world,{basis,taskId:"depot-release",attemptId:"direct:depot-release",
    envelopeId:"direct:"+basis,writePaths:obligations.rules.mayWrite,obligations},candidate);
}

export function inspectDelivery(world,candidate,receiptDatabase) {
  let files = null;
  try {
    files = inspectFiles(world,candidate);
    requireWorkRevision(files);
  } catch (error) {
    if (!error.refusal) throw error;
    return {ok:false,files,refusal:error.refusal};
  }
  let saved;
  try { saved=JSON.parse(git(world,"show",candidate+":"+receiptPath)); } catch {}
  const db=new DatabaseSync(receiptDatabase,{readOnly:true});
  let matched;
  try {
    matched=db.prepare("SELECT receipt FROM receipts WHERE sha=?").all(typeof saved?.sha==="string"?saved.sha:"")
      .some(row=>isDeepStrictEqual(saved,JSON.parse(row.receipt)));
  } finally { db.close(); }
  return matched ? {ok:true,files,measuredSha:saved.sha,captureDigest:saved.captureDigest} :
    {ok:false,files,refusal:{reason:"MEASURED_RECEIPT_MISMATCH",paths:[receiptPath],candidate,nextAction:"FIX_CANDIDATE",
      detail:"Save the complete receipt object returned by the shift desk unchanged as JSON, then commit."}};
}
