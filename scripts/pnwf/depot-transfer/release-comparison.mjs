import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {digest,readJson,writeJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";

const [archive,previous,output]=process.argv.slice(2).map(p=>resolve(p));
const r4=readJson(join(archive,"frozen.json")).cells.every(([ticket])=>ticket==="envelope");
function summarize(folder){
  const o=readJson(join(folder,"observation.json")),row=readJson(join(folder,"row.json"));
  const contacts=r4?readJson(join(folder,"desk/journal.json")).filter(e=>e.kind==="CONTACT"):[];
  const t=readJson(join(folder,"trajectory.json")).traces.find(t=>t.role==="principal");
  const stream=join(folder,"runtime-REVIEW/sessions/--run-stage-world--",t.session,"session.v4.jsonl.zstd");
  const raw=new Map(readStream(stream,digest(readFileSync(stream))).filter(e=>e.type==="tool/result").map(e=>[e.seq,e]));
  const responses=[];
  for(const c of t.calls){
    if(!["depot_trial","depot_contact","depot_release_check"].includes(c.tool)&&
        !(c.tool==="palimpsest_work"&&c.input.intent==="DELIVER"))continue;
    const message=raw.get(c.resultSeq)?.data.message;
    if(message)assert.equal(message.toolCallId,c.callId);
    let reply;try{reply=JSON.parse(message?.content?.find(b=>b.type==="text")?.text??c.reply);}catch{}
    const power=reply?.receipt?.power??reply?.power;
    responses.push({call:c.seq,result:c.resultSeq,callId:c.callId,tool:c.tool,sha:c.input.sha??reply?.candidate??null,
      source:reply?.receipt?.run??null,received:!!reply?.receipt,withinLimits:power?.withinLimits??reply?.receipt?.withinLimits??null,
      requested:reply?.receipt?.requested??null,departure:reply?.receipt?.departureKwh??null,
      reason:reply?.refusal?.reason??reply?.reason??power?.refusal?.reason??null,
      violations:reply?.refusal?.violations??reply?.violations??power?.refusal?.violations??[],state:reply?.state??null});
  }
  return {arm:row.arm,basis:o.basis,head:o.head,quality:o.observed.score,checks:o.observed.checks,
    sheet:o.observed.plan.acKw,release:o.observed.release,protected:o.observed.protectedFiles.every(f=>f.preserved),
    filed:row.release?.filed??null,natural:o.natural,conclusion:o.conclusion,requests:o.requests,confirmed:o.confirmed,
    unknown:o.unknown,total:o.total,actors:o.actors,elapsedMs:o.elapsedMs,commits:o.commits,responses,
    finalCheck:row.release?.check??null,reviewTurns:o.reviewPhases.reviews.map(r=>({sha:r.sha,reason:r.reason,before:r.before,after:r.after})),
    ...(r4?{validSupport:o.validSupport,delegations:o.delegations,reviewUsage:o.reviewPhases.maintainer,
      releaseWrites:t.calls.filter(c=>c.tool==="write"&&c.ok&&c.input.file_path?.endsWith("/release.json")).map(c=>{
        const decision=JSON.parse(c.input.content);
        return {call:c.seq,result:c.resultSeq,callId:c.callId,at90:decision.at90,departureKwh:decision.departureKwh};
      }),
      reviews:o.reviews.map((r,index)=>{
        const call=responses.find(c=>c.call===r.call&&c.result===r.result&&c.tool==="depot_contact");
        const contact=contacts[index];
        assert(call&&contact.sha===r.sha&&contact.question===r.question);
        if(r.delivered)assert(call.received&&call.sha===r.sha);
        return {call:r.call,result:r.result,callId:call.callId,sha:r.sha,cached:r.cached,delivered:r.delivered,
          requested:r.receipt?.requested??null,departure:r.receipt?.departureKwh??null,
          principalHead:contact.principal.head,decisionAtContact:o.commits.find(c=>c.sha===contact.principal.head)?.release?.at90??null};
      })}: {})};
}
const result={previous:{},mock:{},live:{}};
for(const arm of ["P","F"]){
  const old=summarize(join(previous,"live","controller-"+arm));assert.equal(old.quality,r4?10:6);
  result.previous[arm]=old;
}
if(r4){
  const prior=join(archive,"../../2026-11-19/depot-transfer/live/envelope-P");
  result.originalR4={P:summarize(prior),F:summarize(join(previous,"../depot-transfer/live/envelope-F"))};
  assert.equal(result.originalR4.P.quality,2);
  assert.equal(result.originalR4.P.unknown,1);
  assert.equal(result.originalR4.P.total,null);
  assert.equal(result.originalR4.F.quality,10);
}
for(const mode of ["mock","live"]){
  const batch=readJson(join(archive,mode,"matrix.json"));
  result[mode]={stop:batch.stop??null,rows:batch.rows.map(row=>summarize(join(archive,mode,row.id)))};
}
writeJson(output,result);
