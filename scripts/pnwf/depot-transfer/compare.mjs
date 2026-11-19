import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {readJson,writeJson} from "../energy/contract.mjs";

const [archive,output]=process.argv.slice(2),root=resolve(archive);
const frozen=readJson(join(root,"frozen.json"));
function compare(mode){
  const batch=readJson(join(root,mode,"matrix.json"));assert.deepEqual(batch.seal,frozen);
  const rows=batch.rows.map(({id})=>{
    const dir=join(root,mode,id),o=readJson(join(dir,"observation.json")),t=readJson(join(dir,"trajectory.json"));
    const calls=t.traces.find(s=>s.role==="principal").calls;
    const reviewed=o.reviews.filter(r=>r.delivered);
    const revised=reviewed.filter(r=>r.receipt.requested[3]>r.receipt.requested[2]);
    const counterexample=revised.find(r=>r.receipt.auxiliaryMeterB.endKwh>r.receipt.auxiliaryMeterB.startKwh);
    const commitsAfter=counterexample?calls.filter(c=>c.seq>counterexample.result&&c.tool==="bash"&&
      /\bgit\s+(?:-C\s+\S+\s+)?commit\b/u.test(c.input.command)).map(c=>({call:c.seq,result:c.resultSeq})):[];
    const measuredCommit=counterexample?o.commits.find(c=>c.sha===counterexample.sha):null;
    return {id,head:o.head,committed:o.head!==o.basis,quality:o.observed.score,checks:o.observed.checks,release:o.observed.release,
      supported:o.validSupport,contacts:o.reviews.length,revisedMeasurements:revised.length,delegations:o.delegations,
      returnedCounterexample:counterexample?{call:counterexample.call,result:counterexample.result,sha:counterexample.sha,
        beforeFiledDecision:measuredCommit?.release??null,measured:counterexample.receipt.departureKwh,subsequentCommitCalls:commitsAfter}:null,
      natural:o.natural,conclusion:o.conclusion,actors:o.actors,reviewTurns:o.reviewPhases.reviews.map(r=>({
        sha:r.sha,completed:r.reason==="completed"&&r.exitCode===0,before:r.before??null,after:r.after??null})),
      requests:o.requests,confirmed:o.confirmed,unknown:o.unknown,total:o.total,elapsedMs:o.elapsedMs};
  });
  return {rows,stop:batch.stop??null,unrun:frozen.cells.map(([k,a])=>k+"-"+a).filter(id=>!rows.some(r=>r.id===id))};
}
const result={mock:compare("mock")};
if(existsSync(join(root,"live/matrix.json")))result.live=compare("live");
writeJson(resolve(output),result);
