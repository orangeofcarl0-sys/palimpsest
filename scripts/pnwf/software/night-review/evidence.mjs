import assert from "node:assert/strict";
import {copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {zstdCompressSync} from "node:zlib";
import {readStream} from "../../analyze_energy_trajectory.mjs";
import {attribute} from "../../energy/evidence.mjs";
import {digest,readJson,writeJson} from "../../energy/contract.mjs";
import {history,historyPath,maintainer} from "./fixture.mjs";

export const id="REVIEW";
function streams(dir){return readdirSync(dir,{recursive:true}).filter(f=>f.endsWith(".jsonl.zstd"));}
function events(path){return readStream(path,digest(readFileSync(path)));}
export function projectWindow(run){
  const home=join(run,"runtime-"+id),raw=join(run,"raw-sessions"),derived=join(home,"sessions");
  renameSync(derived,raw);mkdirSync(derived);
  const seed=readFileSync(history);
  for(const f of streams(raw)){
    const from=join(raw,f),to=join(derived,f);mkdirSync(dirname(to),{recursive:true});
    if(!f.includes(maintainer)){copyFileSync(from,to);continue;}
    const bytes=readFileSync(from);assert(bytes.subarray(0,seed.length).equals(seed),"Previous shift stream prefix changed");
    if(bytes.length===seed.length)continue;
    const all=events(from),boundary=events(history).at(-1).seq;
    const current=all.filter(e=>e.seq>boundary);
    writeFileSync(to,Buffer.concat([all[0],...current].map(e=>zstdCompressSync(Buffer.from(JSON.stringify(e)+"\n")))));
  }
}
export function analyze(run,mode){
  const out=join(run,"out",id);
  if(!existsSync(join(out,"attribution")))attribute(run,id,mode);
  const ledger=readJson(join(out,"request-accounting.json"));
  const obs=readFileSync(join(out,"request-observations.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
  const admitted=new Set(obs.filter(o=>o.kind==="ADMITTED").map(o=>o.requestId));
  const terminals=obs.filter(o=>o.kind==="TERMINAL");
  const principal=JSON.parse(readFileSync(join(out,"run.log"),"utf8").split(/\r?\n/).find(l=>l.startsWith("PALIMPSEST_HOST_READY ")).slice(22)).sessionId;
  const traces=[],bindings=[],used=new Set();
  for(const f of streams(join(run,"runtime-"+id,"sessions"))){
    const ev=events(join(run,"runtime-"+id,"sessions",f)),session=ev[0].id;
    const role=session===principal?"principal":session===maintainer?"resumed-maintainer":"other-agent";
    const calls=[],answers=[];
    const timeline=readdirSync(join(out,"attribution")).filter(p=>p.endsWith(".timeline.json")).map(p=>readJson(join(out,"attribution",p)).summary).find(t=>t.session.id===session);
    const bySeq=new Map(ev.map(e=>[e.seq,e]));
    for(const row of timeline.calls){
      const e=bySeq.get(row.seq),result=timeline.results.find(x=>x.callId===row.callId && x.callSeq===row.seq);
      let input=e.data.arguments;
      if(typeof input==="string"){try{input=JSON.parse(input);}catch{}}
      const reply=bySeq.get(result?.seq)?.data.message?.content?.filter(b=>b.type==="text").map(b=>b.text).join("\n")??"";
      calls.push({seq:e.seq,time:e.time,callId:row.callId,tool:e.data.name,input,resultSeq:result?.seq??null,reply:reply.slice(0,3000)});
    }
    for(const e of ev.filter(e=>e.type==="assistant/message"&&e.data.usage)){
      const u=e.data.usage;
      const eq=o=>o.usage.input_tokens===u.inputTokens&&o.usage.cache_read_input_tokens===(u.cacheReadTokens??0)&&o.usage.cache_creation_input_tokens===(u.cacheWriteTokens??0)&&o.usage.output_tokens===u.outputTokens;
      const ids=(e.data.message.source?.replayState?.blocks??[]).map(b=>b.signature).filter(x=>typeof x==="string"&&x.startsWith("msg_"));
      const choices=terminals.filter(o=>eq(o)&&(!ids.length||ids.includes(o.messageId)));
      assert.equal(choices.length,1,"Ambiguous or missing terminal usage");
      const t=choices[0],b=ledger.requests.find(r=>r.id===t.requestId);
      assert(admitted.has(t.requestId)&&!used.has(t.requestId)&&b?.state==="SETTLED");
      assert.equal(b.actual,Object.values(t.usage).reduce((sum,n)=>sum+n,0));
      used.add(t.requestId);bindings.push({role,session,seq:e.seq,id:t.requestId,method:ids.length?"response-id":"unique-usage",usage:t.usage});
      const visible=e.data.message.content.filter(b=>b.type==="text").map(b=>b.text).join("\n");
      if(visible)answers.push({seq:e.seq,time:e.time,text:visible});
    }
    traces.push({role,session,parent:ev[0].parentSession??null,calls,answers,tools:ev.find(e=>e.type==="request/header")?.data.header.tools.map(t=>t.name)??[]});
  }
  assert.equal(ledger.unresolvedRequests,0);assert.equal(used.size,ledger.requests.length);assert.equal(used.size,terminals.length);assert.equal(admitted.size,used.size);
  return {bindings,traces,confirmed:ledger.confirmed,unknown:ledger.unresolvedRequests};
}

