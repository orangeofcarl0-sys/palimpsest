// Recompute exclusive per-response totals from the original request order and reviewed action labels.
import assert from "node:assert/strict";
import {resolve,join} from "node:path";
import {readJson,writeJson} from "../energy/contract.mjs";

const [archive,labels,output]=process.argv.slice(2);
const matrix=readJson(join(resolve(archive),"matrix.json"));
const categories=["discovery","effectiveRework","validation","closing","mixed","unproductive",
  "privateRework","privateValidation","privateClosing"];
const judgments=labels?readJson(labels):null;
const result={arms:{}};
function accumulate(groups,key,u,tokens){
  const bucket=groups[key]??={requests:0,fresh:0,cacheRead:0,cacheWrite:0,output:0,total:0};
  bucket.requests++;bucket.total+=tokens;bucket.fresh+=u.input_tokens;bucket.cacheRead+=u.cache_read_input_tokens;
  bucket.cacheWrite+=u.cache_creation_input_tokens;bucket.output+=u.output_tokens;
}
for(const arm of matrix.arms){
  const dir=join(archive,arm.arm);
  const trace=readJson(join(dir,"trajectory.json"));
  const ledger=readJson(join(dir,"out/REVIEW/request-accounting.json"));
  const entries=[],totals={},roles={};
  const byId=new Map(trace.bindings.map(b=>[b.id,b]));
  const seen=new Set();
  let confirmed=0;
  for(const [index,row] of ledger.requests.entries()){
    if(row.state==="UNKNOWN"){
      assert(!byId.has(row.id)&&row.actual===null);
      entries.push({n:index+1,id:row.id,category:"unknown",tokens:null,reason:row.reason});
      continue;
    }
    const b=byId.get(row.id);
    assert(b&&!seen.has(row.id));seen.add(row.id);
    const session=trace.traces.find(t=>t.session===b.session);
    const calls=b.calls.map(seq=>session.calls.find(c=>c.seq===seq));
    const u=b.usage,tokens=Object.values(u).reduce((a,b)=>a+b);
    assert.equal(row.actual,tokens);
    confirmed+=tokens;
    const entry={n:index+1,id:row.id,role:b.role,session:b.session,seq:b.seq,method:b.method,
      calls:calls.map(c=>({seq:c.seq,tool:c.tool,callId:c.callId,resultSeq:c.resultSeq})),usage:u,tokens};
    if(!judgments){
      console.log(arm.arm,index+1,b.id,b.role,b.seq,tokens,calls.map(c=>[c.seq,c.tool,JSON.stringify(c.input).slice(0,300),c.reply.slice(0,150)]),
        session.answers.find(a=>a.seq===b.seq)?.text.slice(0,130)??"");
      continue;
    }
    const label=judgments[arm.arm]?.[row.id];
    assert(label&&categories.includes(label[0])&&label[1],row.id);
    [entry.category,entry.reason]=label;
    accumulate(totals,entry.category,u,tokens);
    accumulate(roles,entry.role,u,tokens);
    entries.push(entry);
  }
  assert.equal(seen.size,byId.size);assert.equal(confirmed,ledger.confirmed);
  if(!judgments)continue;
  assert.equal(Object.keys(judgments[arm.arm]).length,seen.size);
  assert.equal(Object.values(totals).reduce((n,v)=>n+v.total,0),confirmed);
  result.arms[arm.arm]={admitted:entries.length,confirmed,unknown:ledger.unresolvedRequests,
    total:ledger.unresolvedRequests?null:confirmed,roles,totals,entries};
}
if(judgments)writeJson(output,result);
