import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {digest,readJson,writeJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";

const [archive,previous,output]=process.argv.slice(2).map(p=>resolve(p));
function summarize(folder){
  const o=readJson(join(folder,"observation.json")),row=readJson(join(folder,"row.json"));
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
    finalCheck:row.release?.check??null,reviewTurns:o.reviewPhases.reviews.map(r=>({sha:r.sha,reason:r.reason,before:r.before,after:r.after}))};
}
const result={previous:{},mock:{},live:{}};
for(const arm of ["P","F"]){
  const old=summarize(join(previous,"live","controller-"+arm));assert.equal(old.quality,6);
  result.previous[arm]=old;
}
for(const mode of ["mock","live"]){
  const batch=readJson(join(archive,mode,"matrix.json"));
  result[mode]={stop:batch.stop??null,rows:batch.rows.map(row=>summarize(join(archive,mode,row.id)))};
}
writeJson(output,result);
