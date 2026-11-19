import assert from "node:assert/strict";
import {existsSync,mkdirSync,readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";
import {attribute} from "../energy/evidence.mjs";
import {digest,readJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {maintainer} from "../software/night-review/fixture.mjs";

export function analyze(run,mode){
  const id="REVIEW",out=join(run,"out",id);
  const measured=attribute(run,id,mode);
  const roots=[join(run,"runtime-"+id,"sessions"),...measured.workerReceipts.filter(w=>w.attemptId).map(w=>join(out,"worker-"+w.attemptId,"home/sessions"))];
  const observations=readFileSync(join(out,"request-observations.jsonl"),"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const terminal=observations.filter(o=>o.kind==="TERMINAL");
  const used=new Set(),bindings=[],traces=[];
  for(const root of roots.filter(existsSync))for(const file of readdirSync(root,{recursive:true}).filter(f=>f.endsWith(".zstd"))){
    const path=join(root,file),rows=readStream(path,digest(readFileSync(path)));
    const session=rows[0].id,role=session===maintainer?"maintainer":measured.traces.find(t=>t.id===session).role;
    const timeline=readdirSync(join(out,"attribution")).filter(f=>f.endsWith(".timeline.json")).map(f=>readJson(join(out,"attribution",f)).summary).find(t=>t.session.id===session);
    const events=new Map(rows.map(e=>[e.seq,e]));
    const calls=timeline.calls.map(c=>{
      const r=timeline.results.find(r=>r.callId===c.callId&&r.callSeq===c.seq);
      const e=events.get(c.seq),reply=events.get(r?.seq)?.data.message.content?.filter(b=>b.type==="text").map(b=>b.text).join("\n")??"";
      let input=e.data.arguments;try{input=JSON.parse(input)}catch{}
      return {seq:c.seq,at:e.time,callId:c.callId,tool:e.data.name,input,resultSeq:r?.seq??null,ok:r?.ok??null,refusal:r?.refusal??null,reply:reply.slice(0,4200)};
    });
    const answers=[];
    for(const e of rows.filter(e=>e.type==="assistant/message"&&e.data.usage)){
      const u=e.data.usage,ids=(e.data.message.source?.replayState?.blocks??[]).map(b=>b.signature).filter(s=>typeof s==="string"&&s.startsWith("msg_"));
      const options=terminal.filter(o=>o.actor===(role==="worker"?"worker":"principal-container")&&o.usage.input_tokens===u.inputTokens&&o.usage.output_tokens===u.outputTokens&&o.usage.cache_read_input_tokens===(u.cacheReadTokens??0)&&o.usage.cache_creation_input_tokens===(u.cacheWriteTokens??0)&&(!ids.length||ids.includes(o.messageId)));
      assert.equal(options.length,1,"ambiguous or missing terminal");const o=options[0];assert(!used.has(o.requestId));used.add(o.requestId);
      bindings.push({role,session,seq:e.seq,id:o.requestId,method:ids.length?"response-id":"unique-usage",usage:o.usage});
      const text=e.data.message.content.filter(b=>b.type==="text").map(b=>b.text).join("\n");if(text)answers.push({seq:e.seq,text});
    }
    traces.push({role,session,calls,answers,tools:rows.find(e=>e.type==="request/header")?.data.header.tools.map(t=>t.name)??[]});
  }
  assert(measured.usageQualified&&measured.principalId&&used.size===measured.requests);
  return {requests:measured.requests,usage:measured.usage,usageByRole:measured.usageByRole,confirmed:measured.knownTokens,unknown:measured.unresolvedRequests,elapsedMs:measured.elapsedMs,bindings,traces};
}
