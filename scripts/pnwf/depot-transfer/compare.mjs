import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {readJson,writeJson} from "../energy/contract.mjs";

const [archive,output,extension]=process.argv.slice(2),root=resolve(archive);
const frozen=readJson(join(root,"frozen.json"));
function compare(mode,archiveDir=root){
  const batch=readJson(join(archiveDir,mode,"matrix.json"));assert.deepEqual(batch.seal,readJson(join(archiveDir,"frozen.json")));
  const rows=batch.rows.map(({id})=>{
    const dir=join(archiveDir,mode,id),o=readJson(join(dir,"observation.json")),t=readJson(join(dir,"trajectory.json"));
    const calls=t.traces.find(s=>s.role==="principal").calls;
    const reviewed=o.reviews.filter(r=>r.delivered);
    const revised=reviewed.filter(r=>r.receipt.requested[3]>r.receipt.requested[2]);
    const counterexample=revised.find(r=>r.receipt.auxiliaryMeterB.endKwh>r.receipt.auxiliaryMeterB.startKwh);
    const commitsAfter=counterexample?calls.filter(c=>c.seq>counterexample.result&&c.tool==="bash"&&
      /\bgit\s+(?:-C\s+\S+\s+)?commit\b/u.test(c.input.command)).map(c=>({call:c.seq,result:c.resultSeq})):[];
    const measuredCommit=counterexample?o.commits.find(c=>c.sha===counterexample.sha):null;
    // A rejected SHA and its successful retry can carry identical questions. The
    // model-visible tool result, paired by call ID, determines actual delivery.
    const contactCalls=extension?calls.filter(c=>c.tool==="depot_contact").map(c=>{
      assert(c.callId&&Number.isInteger(c.resultSeq));
      const reply=JSON.parse(c.reply);
      if(reply.ok)assert.equal(reply.receipt.sha,c.input.sha);
      return {id:c.callId,call:c.seq,result:c.resultSeq,sha:c.input.sha,
        receipt:reply.receipt??null,refusal:reply.ok?null:reply.reason};
    }):null;
    if(contactCalls){
      assert.equal(new Set(contactCalls.map(c=>c.id)).size,contactCalls.length);
      const journal=readJson(join(dir,"desk/journal.json")).filter(e=>e.kind==="RETURN");
      assert.deepEqual(contactCalls.filter(c=>c.receipt).map(c=>c.receipt),journal.map(e=>e.receipt));
    }
    return {id,head:o.head,committed:o.head!==o.basis,quality:o.observed.score,checks:o.observed.checks,release:o.observed.release,
      supported:o.validSupport,contacts:o.reviews.length,revisedMeasurements:revised.length,delegations:o.delegations,
      returnedCounterexample:counterexample?{call:counterexample.call,result:counterexample.result,sha:counterexample.sha,
        beforeFiledDecision:measuredCommit?.release??null,measured:counterexample.receipt.departureKwh,subsequentCommitCalls:commitsAfter}:null,
      natural:o.natural,conclusion:o.conclusion,actors:o.actors,reviewTurns:o.reviewPhases.reviews.map(r=>({
        sha:r.sha,completed:r.reason==="completed"&&r.exitCode===0,before:r.before??null,after:r.after??null})),
      requests:o.requests,confirmed:o.confirmed,unknown:o.unknown,total:o.total,elapsedMs:o.elapsedMs,
      ...(contactCalls?{contactCalls}:{})};
  });
  return {rows,stop:batch.stop??null,unrun:frozen.cells.map(([k,a])=>k+"-"+a).filter(id=>!rows.some(r=>r.id===id))};
}
const result={mock:compare("mock")};
if(existsSync(join(root,"live/matrix.json")))result.live=compare("live");
if(extension){
  const continuation=compare("live",resolve(extension));
  const rows=[...result.live.rows,...continuation.rows];
  const ordered=frozen.cells.map(([ticket,arm])=>ticket+"-"+arm);
  assert.deepEqual(rows.map(r=>r.id),ordered.slice(0,rows.length));
  result.live={rows,previousStop:result.live.stop,stop:continuation.stop,unrun:ordered.slice(rows.length)};
  const probe=readJson(join(extension,"probe/probe.json"));
  result.routeProbe={requestId:probe.requestId,elapsedMs:probe.elapsedMs,confirmed:probe.accounting.confirmed};
}
writeJson(resolve(output),result);
