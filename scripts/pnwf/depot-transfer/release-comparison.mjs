import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {digest,readJson,writeJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {git} from "../transit-desk/run.mjs";

const [archive,previous,output]=process.argv.slice(2).map(p=>resolve(p));
const frozen=readJson(join(archive,"frozen.json"));
const r4=frozen.cells.every(([ticket])=>ticket==="envelope");
const fullWindow=Object.hasOwn(frozen.files,"window-protocol.md");
const split=Object.hasOwn(frozen.files,"split-protocol.md");
// A later amend can remove an already filed decision from the final first-parent history.
function pinnedDecision(folder,journal,sha){
  const start=journal.find(e=>e.kind==="START_REVIEW"&&e.sha===sha);
  assert(start,"Missing immutable review snapshot for "+sha);
  const tmp=mkdtempSync(join(tmpdir(),"r4-dispatch-at-contact-"));
  try{
    git(tmp,"init","-q");git(tmp,"fetch","-q",join(folder,"desk",String(start.n),"pinned.bundle"),"HEAD");
    assert.equal(git(tmp,"rev-parse","FETCH_HEAD").trim(),sha);
    if(!git(tmp,"ls-tree",sha,"--","release.json").trim())return null;
    return JSON.parse(git(tmp,"show",sha+":release.json")).at90??null;
  }finally{rmSync(tmp,{recursive:true,force:true});}
}
function summarize(folder){
  const o=readJson(join(folder,"observation.json")),row=readJson(join(folder,"row.json"));
  const journal=r4?readJson(join(folder,"desk/journal.json")):[];
  const contacts=journal.filter(e=>e.kind==="CONTACT");
  const t=readJson(join(folder,"trajectory.json")).traces.find(t=>t.role==="principal");
  const stream=join(folder,"runtime-REVIEW/sessions/--run-stage-world--",t.session,"session.v4.jsonl.zstd");
  const events=readStream(stream,digest(readFileSync(stream)));
  const raw=new Map(events.filter(e=>e.type==="tool/result").map(e=>[e.seq,e]));
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
      violations:reply?.refusal?.violations??reply?.violations??power?.refusal?.violations??[],state:reply?.state??null,
      ...(fullWindow?{unused:reply?.window?.unused??reply?.refusal?.unused??reply?.unused??null}:{})});
  }
  return {arm:row.arm,...(row.condition&&{condition:row.condition}),basis:o.basis,head:o.head,quality:o.observed.score,checks:o.observed.checks,
    sheet:o.observed.plan.acKw,release:o.observed.release,protected:o.observed.protectedFiles.every(f=>f.preserved),
    filed:row.release?.filed??null,natural:o.natural,conclusion:o.conclusion,requests:o.requests,confirmed:o.confirmed,
    unknown:o.unknown,total:o.total,actors:o.actors,elapsedMs:o.elapsedMs,commits:o.commits,responses,
    finalCheck:row.release?.check??null,reviewTurns:o.reviewPhases.reviews.map(r=>({sha:r.sha,reason:r.reason,before:r.before,after:r.after})),
    ...(split?{firstNamed:responses.find(c=>c.unused?.some(s=>s.time==="01:30"&&s.bus==="B"&&s.unusedKw===20))?.result??null,
      statements:events.filter(e=>e.type==="assistant/message").flatMap(e=>
        (e.data.message.content??[]).filter(block=>block.type==="text"&&block.text?.trim()).map(block=>({seq:e.seq,text:block.text}))),
      actions:t.calls.filter(c=>["edit","write","bash","depot_contact","todo_write"].includes(c.tool)).map(c=>{
        const message=raw.get(c.resultSeq)?.data.message;
        if(message)assert.equal(message.toolCallId,c.callId);
        return {call:c.seq,result:c.resultSeq,id:c.callId,tool:c.tool,ok:c.ok,input:c.input};
      })}:{}),
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
        const atContact=o.commits.find(c=>c.sha===contact.principal.head);
        const decision=split&&!atContact&&contact.principal.head!==row.basis&&r.delivered?
          pinnedDecision(folder,journal,contact.principal.head):atContact?.release?.at90??null;
        return {call:r.call,result:r.result,callId:call.callId,sha:r.sha,cached:r.cached,delivered:r.delivered,
          requested:r.receipt?.requested??null,departure:r.receipt?.departureKwh??null,
          principalHead:contact.principal.head,decisionAtContact:decision};
      })}: {})};
}
const result={previous:{},mock:{},live:{}};
for(const arm of ["P","F"]){
  const old=summarize(join(previous,"live",(fullWindow?"envelope-":"controller-")+arm));
  assert.equal(old.quality,split||r4&&!fullWindow?10:6);
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
