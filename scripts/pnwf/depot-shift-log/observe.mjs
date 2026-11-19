import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {digest,readJson,writeJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {git} from "../transit-desk/run.mjs";

function captureAudit(dir,arm){
  const scratch=mkdtempSync(join(tmpdir(),"duty-capture-check-"));
  try{
    git(scratch,"init","-q");git(scratch,"fetch","-q",resolve(dir,"world.bundle"),"HEAD");
    const path="operations/cold-cycle.json";
    const record=JSON.parse(git(scratch,"show",arm.head+":"+path)),actual=readJson(join(dir,"private-capture.json"));
    const readings=r=>r.samples?.map(s=>[s.acMeterStartKwh,s.acMeterEndKwh])??null;
    const meterLimits=r=>r.samples?.map(s=>(s.acMeterEndKwh-s.acMeterStartKwh)*60/s.minutes)??null;
    const oldBlob=git(scratch,"rev-parse",arm.basis+":"+path).trim();
    const revisions=git(scratch,"rev-list","--reverse",arm.basis+".."+arm.head).trim().split("\n").filter(Boolean).map(sha=>{
      const capture=JSON.parse(git(scratch,"show",sha+":"+path));
      const receiptPath="operations/duty-2340.json";
      const saved=git(scratch,"ls-tree",sha,"--",receiptPath).trim()?JSON.parse(git(scratch,"show",sha+":"+receiptPath)):null;
      return {sha,capture:capture.run,registers:readings(capture),meterLimits:meterLimits(capture),claimedLimits:capture.limitsKw??null,
        archivedLateReceipt:saved,plan:JSON.parse(git(scratch,"show",sha+":shift-plan.json")).acKw,
        paths:git(scratch,"diff","--name-only",arm.basis,sha).trim().split("\n")};
    });
    return {record:record.run,basisCaptureBlob:oldBlob,committedCaptureBlob:git(scratch,"rev-parse",arm.head+":"+path).trim(),
      otherPathsWithOriginalBytes:git(scratch,"ls-tree","-r",arm.head).split("\n").filter(l=>l.includes(oldBlob+"\t")).map(l=>l.split("\t")[1]).filter(p=>p!==path),
      claimedLimits:record.limitsKw??null,candidateRegisters:readings(record),candidateMeterLimits:meterLimits(record),
      lateRegisters:readings(actual),lateMeterLimits:meterLimits(actual),claimedCaptureDigest:record.captureDigest??null,
      lateDigest:digest(JSON.stringify(actual)),sameRawSamples:JSON.stringify(record.samples)===JSON.stringify(actual.samples),revisions};
  }finally{rmSync(scratch,{recursive:true,force:true});}
}

const [root,out]=process.argv.slice(2);
const matrix=readJson(join(root,"matrix.json"));
const result={mode:matrix.mode,basis:matrix.arms[0].basis,arms:{}};
for(const arm of matrix.arms){
  const dir=join(root,arm.arm), t=readJson(join(dir,"trajectory.json"));
  const journal=readJson(join(dir,"desk/journal.json"));
  const ledger=readJson(join(dir,"out/REVIEW/request-accounting.json"));
  const actors={},matched=new Set();
  for(const b of t.bindings){
    const row=ledger.requests.find(r=>r.id===b.id);
    assert(row?.state==="SETTLED"&&!matched.has(row.id));matched.add(row.id);
    const u=b.usage, total=Object.values(u).reduce((a,b)=>a+b,0);
    assert.equal(row.actual,total);
    const obj=actors[b.role]??={requests:0,fresh:0,cacheRead:0,cacheWrite:0,output:0,total:0};
    obj.requests++;obj.total+=total;obj.fresh+=u.input_tokens;obj.cacheRead+=u.cache_read_input_tokens;
    obj.cacheWrite+=u.cache_creation_input_tokens;obj.output+=u.output_tokens;
  }
  assert.equal(matched.size,ledger.requests.filter(r=>r.state==="SETTLED").length);
  assert.equal(Object.values(actors).reduce((sum,o)=>sum+o.total,0),ledger.confirmed);
  const p=t.traces.find(s=>s.role==="principal");
  const contacts=p.calls.filter(c=>c.tool==="depot_contact");
  const usedContacts=new Set();
  const contactFacts=journal.filter(e=>e.kind==="CONTACT").map(e=>{
    const ret=journal.find(r=>r.n===e.n&&r.kind==="RETURN");
    const call=contacts.find(c=>!usedContacts.has(c.callId)&&c.input?.sha===e.sha&&c.input.question===e.question);
    assert(call,"Host contact has no matching Principal call");
    usedContacts.add(call.callId);
    const tested=journal.find(r=>r.n===e.n&&r.kind==="PEER_TRIAL");
    const delivered=!!ret&&call.reply.includes(ret.receipt.captureDigest);
    return {index:e.n,at:e.at,sha:e.sha,question:e.question,callId:call.callId,callSeq:call.seq,resultSeq:call.resultSeq,
      before:e.principal,measuredAt:tested?.at??null,hostReturnAt:ret?.at??null,onHostReturn:ret?.principal??null,
      delivered,reply:call.reply,receipt:delivered?ret.receipt:null};
  });
  const home=join(dir,"runtime-REVIEW/sessions");
  const raw=readdirSync(home,{recursive:true}).find(path=>path.endsWith(".zstd")&&path.includes(p.session));
  const path=join(home,raw),events=readStream(path,digest(readFileSync(path)));
  const returned=contactFacts.find(c=>c.receipt);
  const firstPrivate=events.find(e=>{
    const serialized=JSON.stringify(e);
    return serialized.includes(arm.priorGrade.observed.run)||serialized.includes(arm.priorGrade.observed.captureDigest);
  });
  const reviewer=t.traces.find(s=>s.role==="maintainer");
  const firstReviewerEvidence=reviewer?.calls.find(c=>c.reply.includes(arm.priorGrade.observed.run)&&
    (c.tool==="depot_shift_log"||c.tool==="depot_trial"));
  result.arms[arm.arm]={head:arm.head,clean:arm.status==="",grade:arm.grade,publicBasis:arm.publicTrial,privateBasis:arm.priorGrade.observed,
    natural:arm.execution.natural,conclusion:arm.journal?.intent??null,elapsedMs:t.elapsedMs,
    requests:ledger.requests.length,confirmed:ledger.confirmed,unknown:ledger.unresolvedRequests,total:ledger.unresolvedRequests?null:ledger.confirmed,
    actors,captureAudit:captureAudit(dir,arm),contacts:contactFacts,attempts:contacts.map(c=>({callId:c.callId,seq:c.seq,resultSeq:c.resultSeq,
      accepted:usedContacts.has(c.callId),question:c.input.question,reply:c.reply})),
    visibility:{firstPrivateSeq:firstPrivate?.seq??null,firstPrivateType:firstPrivate?.type??null,firstReturnSeq:returned?.resultSeq??null,
      privateMarkerBeforeReturn:!!firstPrivate&&(!returned||firstPrivate.seq<returned.resultSeq),
      reviewerFirstPrivateResult:firstReviewerEvidence?{call:firstReviewerEvidence.seq,result:firstReviewerEvidence.resultSeq,tool:firstReviewerEvidence.tool}:null},
    actions:t.traces.map(s=>({role:s.role,session:s.session,calls:s.calls.length,
      pairs:s.calls.filter(c=>c.resultSeq!==null).length,fieldTools:s.calls.filter(c=>c.tool.startsWith("depot_")).map(c=>({seq:c.seq,tool:c.tool,result:c.resultSeq}))}))};
}
writeJson(out,result);
