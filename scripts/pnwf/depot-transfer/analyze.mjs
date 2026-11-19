import assert from "node:assert/strict";
import {join} from "node:path";
import {existsSync,readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {readJson} from "../energy/contract.mjs";
import {git} from "../transit-desk/run.mjs";
import {bench,grade,originalSha} from "./case.mjs";
import {reviewPhases} from "../depot-shift-log/review-phases.mjs";

export function analyze(dir,world,row,measuredBench=bench){
  const t=readJson(join(dir,"trajectory.json")),l=readJson(join(dir,"out/REVIEW/request-accounting.json"));
  const p=t.traces.find(s=>s.role==="principal");
  const journal=readJson(join(dir,"desk/journal.json"));
  const observed=grade(row.ticket,world,row.basis,row.head);
  const original=readJsonFromGit(world,row.basis,"operations/original-receipt.json");
  assert.deepEqual(original,bench(row.ticket,world,originalSha));
  const actors={},seen=new Set();
  for(const b of t.bindings){
    const paid=l.requests.find(r=>r.id===b.id);
    assert(paid?.state==="SETTLED"&&!seen.has(b.id));seen.add(b.id);
    const a=actors[b.role]??={requests:0,fresh:0,cacheRead:0,cacheWrite:0,output:0,total:0};
    const u=b.usage;assert.equal(paid.actual,Object.values(u).reduce((s,n)=>s+n,0));
    a.requests++;a.fresh+=u.input_tokens;a.cacheRead+=u.cache_read_input_tokens;a.cacheWrite+=u.cache_creation_input_tokens;
    a.output+=u.output_tokens;a.total+=paid.actual;
  }
  assert.equal(seen.size,l.requests.filter(r=>r.state==="SETTLED").length);
  assert.equal(Object.values(actors).reduce((s,a)=>s+a.total,0),l.confirmed);
  const reviews=[],used=new Set();
  const db=new DatabaseSync(join(dir,"desk/receipts.sqlite"),{readOnly:true});
  try{
    for(const event of journal.filter(e=>e.kind==="CONTACT")){
      const returned=journal.find(e=>e.kind==="RETURN"&&e.n===event.n);
      const c=p.calls.find(c=>!used.has(c.callId)&&c.tool==="depot_contact"&&c.input.sha===event.sha&&c.input.question===event.question&&
        (measuredBench===bench||!returned||parseReply(c)?.ok===true));
      assert(c);used.add(c.callId);
      let parsed;try{parsed=JSON.parse(c.reply);}catch{}
      if(returned){
        assert.deepEqual(returned.receipt,measuredBench(row.ticket,world,event.sha));
        const stored=db.prepare("SELECT receipt FROM receipts WHERE sha=?").get(event.sha);
        assert.deepEqual(JSON.parse(stored.receipt),returned.receipt);
      }
      const delivered=!!returned&&parsed?.ok===true;
      if(delivered)assert.deepEqual(parsed.receipt,returned.receipt);
      reviews.push({sha:event.sha,call:c.seq,result:c.resultSeq,question:c.input.question,delivered,
        receipt:delivered?parsed.receipt:null,sheetAtContact:event.principal.acKw,cached:event.cached});
    }
  }finally{db.close();}
  const gate=observed.release.evidenceSha;
  const matching=reviews.find(r=>r.delivered&&r.sha===gate&&r.receipt.sheetBlob===git(world,"rev-parse",row.head+":shift-plan.json").trim());
  const validSupport=!!matching||(row.ticket==="envelope"&&gate===original.sha);
  const commits=git(world,"rev-list","--reverse",row.basis+".."+row.head).trim().split("\n").filter(Boolean).map(sha=>({
    sha,paths:git(world,"diff-tree","--no-commit-id","--name-only","-r",sha).trim().split("\n"),
    plan:readJsonFromGit(world,sha,"shift-plan.json"),release:readJsonFromGit(world,sha,"release.json")}));
  return {ticket:row.ticket,arm:row.arm,basis:row.basis,head:row.head,observed,validSupport,commits,reviews,
    reviewPhases:reviewPhases(dir),actors,requests:l.requests.length,unknown:l.unresolvedRequests,confirmed:l.confirmed,
    total:l.unresolvedRequests?null:l.confirmed,elapsedMs:t.elapsedMs,natural:row.execution.natural,conclusion:row.conclusion?.intent??null,
    tools:t.traces.map(s=>({role:s.role,calls:s.calls.length,paired:s.calls.filter(c=>c.resultSeq!==null).length})),
    extraContacts:p.calls.filter(c=>c.tool==="depot_contact"&&!used.has(c.callId)).map(c=>({call:c.seq,reply:c.reply})),
    delegations:p.calls.filter(c=>["subagent","workflow"].includes(c.tool)||c.tool==="palimpsest_work"&&c.input.action==="delegate").map(c=>({tool:c.tool,call:c.seq,result:c.resultSeq}))};
}
function parseReply(call){try{return JSON.parse(call.reply);}catch{return null;}}
function readJsonFromGit(world,sha,path){
  if(!git(world,"ls-tree",sha,"--",path).trim())return null;
  try{return JSON.parse(git(world,"show",sha+":"+path));}catch{return null;}
}
