/** Capture a stopped cohort when the host process exited before writing run.json. No provider access. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {join,relative,resolve} from "node:path";
import {tmpdir} from "node:os";
import {DatabaseSync} from "node:sqlite";
import {fileURLToPath} from "node:url";
import {changed,clean,digest,git,head,readJson,writeJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {here} from "./case.mjs";
import {basis,grade,recordRef} from "../software/night-review/fixture.mjs";
import {conclusion} from "../energy/product.mjs";

const files=root=>readdirSync(root,{recursive:true,withFileTypes:true}).filter(f=>f.isFile()).map(f=>join(f.parentPath,f.name));
const folder="software-P",id="REVIEW";
function hashes(root){
  return Object.fromEntries(files(root).filter(p=>p!==join(root,"manifest.json")).map(p=>{
    const bytes=readFileSync(p),h=digest(bytes),text=p.endsWith(".zstd")?JSON.stringify(readStream(p,h)):bytes.toString();
    assert(!/(?:oc_sk_|sk-proj-|github_pat_|ghp_)[\w.-]{32,}/u.test(text),"credential-shaped value in archive");
    return [relative(root,p).replaceAll("\\","/"),h];
  }));
}
function recount(dir){
  const db=new DatabaseSync(join(dir,"request-ledger.sqlite"),{readOnly:true});
  let config,requests,sessions;
  try{config=db.prepare("SELECT state,reason FROM config").get();requests=db.prepare("SELECT * FROM requests ORDER BY rowid").all();sessions=db.prepare("SELECT * FROM sessions").all();}finally{db.close();}
  const out=join(dir,"out",id),obs=readFileSync(join(out,"request-observations.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
  const admitted=obs.filter(o=>o.kind==="ADMITTED"),terms=obs.filter(o=>o.kind==="TERMINAL"),settled=requests.filter(r=>r.state==="SETTLED"),unknown=requests.filter(r=>r.state==="UNKNOWN");
  assert.equal(config.state,"STOPPED");assert.equal(config.reason,"PROVIDER_TIMEOUT");assert.equal(unknown.length,1);
  assert.deepEqual(admitted.map(e=>e.requestId),requests.map(r=>r.id));assert.equal(terms.length,settled.length);assert.equal(settled.length+unknown.length,requests.length);
  assert(!terms.some(t=>t.requestId===unknown[0].id));assert.equal(unknown[0].actual,null);assert.equal(unknown[0].usage,null);
  const sessionsDir=join(dir,"runtime-"+id,"sessions"),streams=files(sessionsDir).filter(p=>p.endsWith(".zstd"));assert.equal(streams.length,1);
  const ev=readStream(streams[0],digest(readFileSync(streams[0]))),principal=JSON.parse(readFileSync(join(out,"run.log"),"utf8").split(/\r?\n/).find(l=>l.startsWith("PALIMPSEST_HOST_READY ")).slice(22)).sessionId;
  assert.equal(principal,ev[0].id);
  const tmp=mkdtempSync(join(tmpdir(),"stopped-attribution-"));
  let timeline;
  try{
    execFileSync(process.execPath,[fileURLToPath(new URL("../../psvr/session_attribution.mjs",import.meta.url)),streams[0],join(tmp,"principal")],{stdio:"pipe"});
    timeline=readJson(join(tmp,"principal.timeline.json")).summary;
  }finally{rmSync(tmp,{recursive:true,force:true});}
  const bySeq=new Map(ev.map(e=>[e.seq,e]));
  const calls=timeline.calls.map(c=>{
    const r=timeline.results.find(r=>r.callId===c.callId&&r.callSeq===c.seq);
    const e=bySeq.get(c.seq);let input=e.data.arguments;try{input=JSON.parse(input)}catch{}
    const reply=bySeq.get(r?.seq)?.data.message.content?.filter(b=>b.type==="text").map(b=>b.text).join("\n")??"";
    return {seq:c.seq,tool:e.data.name,input,callId:c.callId,resultSeq:r?.seq??null,reply:reply.slice(0,4200),ok:r?.ok??null};
  });
  const bindings=[],seen=new Set(),usage={input_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0,output_tokens:0};
  for(const e of ev.filter(e=>e.type==="assistant/message"&&e.data.usage)){
    const u=e.data.usage,ids=(e.data.message.source?.replayState?.blocks??[]).map(b=>b.signature).filter(s=>typeof s==="string"&&s.startsWith("msg_"));
    const tuple={input_tokens:u.inputTokens,cache_read_input_tokens:u.cacheReadTokens??0,cache_creation_input_tokens:u.cacheWriteTokens??0,output_tokens:u.outputTokens};
    const choices=terms.filter(o=>o.actor==="principal-container"&&Object.keys(tuple).every(k=>o.usage[k]===tuple[k])&&(!ids.length||ids.includes(o.messageId)));
    assert.equal(choices.length,1);const o=choices[0],row=settled.find(r=>r.id===o.requestId);
    assert(row&&!seen.has(row.id));assert.equal(row.actual,Object.values(tuple).reduce((a,b)=>a+b,0));assert.deepEqual(JSON.parse(row.usage),tuple);
    seen.add(row.id);bindings.push({seq:e.seq,requestId:row.id,method:ids.length?"response-id":"unique-usage",usage:tuple});
    for(const k of Object.keys(usage))usage[k]+=tuple[k];
  }
  assert.equal(seen.size,settled.length);
  const state=readJson(join(dir,"container-stop.json"));
  assert.equal(state.Running,false);assert.equal(state.ExitCode,137);
  return {session:principal,ledger:config,sessionRows:sessions,admitted:requests.length,settled:settled.length,unknown:unknown.map(r=>({id:r.id,reason:r.reason,actual:r.actual})),
    usage,confirmed:Object.values(usage).reduce((a,b)=>a+b,0),total:null,bindings,calls,paired:calls.filter(c=>c.resultSeq!==null).length,
    startedContainer:state.StartedAt,finishedContainer:state.FinishedAt,containerMs:Date.parse(state.FinishedAt)-Date.parse(state.StartedAt),
    lastStreamEvent:{seq:ev.at(-1).seq,type:ev.at(-1).type,time:ev.at(-1).time}};
}
function capture(source,dest){
  assert(!existsSync(dest));mkdirSync(dest,{recursive:true});const s=join(source,folder),d=join(dest,folder);
  const launch=readJson(join(source,"matrix.json"));assert.equal(launch.mode,"live");assert.equal(launch.qualified,false);
  for(const [domain,arm] of launch.seal.cases.slice(1))assert(!existsSync(join(source,domain+"-"+arm)));
  cpSync(join(source,"matrix.json"),join(dest,"launch-matrix.json"));mkdirSync(d);
  assert(!existsSync(join(s,"out",id,"run.json")));assert(!existsSync(join(s,"request-ledger.sqlite-wal"))||readFileSync(join(s,"request-ledger.sqlite-wal")).length===0);
  for(const f of ["cohort.json","prompt.txt","request-ledger.sqlite","out","runtime-REVIEW/sessions"])cpSync(join(s,f),join(d,f),{recursive:true});
  const out=join(d,"out",id),q=readJson(join(out,"qualification.json"));assert(/^[a-f0-9]{64}$/.test(q.containerId));
  const state=JSON.parse(execFileSync("docker",["inspect",q.containerId,"--format","{{json .State}}"],{encoding:"utf8"}));writeJson(join(d,"container-stop.json"),state);
  const t=recount(d),world=join(s,"stages",id,"world");assert.equal(head(world),basis);assert(clean(world));
  git(world,"bundle","create",join(d,"observed-world.bundle"),"HEAD",recordRef);
  const sourceGrade=grade(join(d,"observed-world.bundle"),basis,launch.seal.image);
  assert.deepEqual(sourceGrade.checks.map(c=>c.passed),[true,false]);
  const result={recoveredOffline:true,submitted:null,gitHead:head(world),clean:clean(world),refs:git(world,"show-ref"),changes:changed(world,basis,head(world)),
    conclusion:conclusion(join(s,"stages",id,"state")),baselineOnly:sourceGrade,desk:readJson(join(out,"review-desk.json")),
    hostExit:{code:1,observedStderr:"Unhandled 'error' event: write EPIPE",source:"launch process diagnostic; final run.json absent"}};
  writeJson(join(d,"result.json"),result);writeJson(join(d,"trajectory.json"),t);
  writeJson(join(dest,"matrix.json"),{...launch,partial:true,cases:[{domain:"software",arm:"P",basis,accounted:false,natural:false,delivery:false,requests:t.admitted,stop:t.ledger.reason}],notStarted:launch.seal.cases.slice(1)});
  writeJson(join(dest,"manifest.json"),hashes(dest));
}
export function verifyPartial(root){
  assert.deepEqual(hashes(root),readJson(join(root,"manifest.json")));const m=readJson(join(root,"matrix.json")),dir=join(root,folder),result=readJson(join(dir,"result.json"));
  for(const [path,h] of Object.entries(m.seal.files))assert.equal(digest(readFileSync(join(here,path))),h,path);
  assert.deepEqual(JSON.parse(JSON.stringify(recount(dir))),readJson(join(dir,"trajectory.json")));
  const g=grade(join(dir,"observed-world.bundle"),basis,m.seal.image);
  assert.equal(g.head,result.gitHead);assert.deepEqual(g.checks.map(x=>[x.input,x.exit,x.passed]),result.baselineOnly.checks.map(x=>[x.input,x.exit,x.passed]));
  console.log("Verified stopped ledger, known request/role bindings, calls, raw stream and unchanged baseline.");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==="--verify")verifyPartial(resolve(process.argv[3]));
  else{const d=resolve(process.argv[3]);capture(resolve(process.argv[2]),d);verifyPartial(d);}
}
