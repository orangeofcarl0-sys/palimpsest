import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {ExecutionBudget,USAGE_ONLY_SCHEMA} from "../execution_budget.mjs";
import {PAID_MODE,PAID_COHORT_SCHEMA} from "../bounded_provider.mjs";
import {requireOpenCodeGoProbe} from "../opencode_go.mjs";
import {startMockProvider} from "../mock_provider.mjs";
import {runContainerSession} from "../container_adapter.mjs";
import {initializeProject,profileFor,conclusion} from "../energy/product.mjs";
import {makeWorkerBroker} from "../energy/container-worker.mjs";
import {runtime,workerPolicy,previousContract,repo} from "../task-selection/case.mjs";
import {git} from "../transit-desk/run.mjs";
import {digest,readJson,writeJson} from "../energy/contract.mjs";
import {profile,history} from "../depot-shift-log/case.mjs";
import {desk} from "../depot-shift-log/desk.mjs";
import {buildEvidence,evidencePaths} from "../depot-relief/evidence.mjs";
import {copy,manifest,saveReviewerCopies} from "../depot-relief/archive.mjs";
import {bench,goal,prepare,obligations,inspect,originalSha,tickets} from "./case.mjs";
import {mockReply} from "./mock.mjs";
import {analyze} from "./analyze.mjs";

const [mode,path,work]=process.argv.slice(2),root=resolve(path),here=fileURLToPath(new URL("./",import.meta.url));
const cells=[["envelope","P"],["envelope","F"],["controller","F"],["controller","P"]];
const {image,window,route,model}=previousContract;
function seal(){
  const files={};
  for(const p of ["run.mjs","case.mjs","protocol.md","mock.mjs","analyze.mjs","../depot-shift-log/desk.mjs","../depot-shift-log/case.mjs",
    "../depot-shift-log/product-entry.mjs","../depot-shift-log/review-entry.mjs","../depot-shift-log/review-trial.mjs","../depot-shift-log/receipt-store.mjs",
    "../depot-relief/plugin/index.js","../depot-relief/evidence.mjs","../depot-relief/rig.mjs","../depot-relief/archive.mjs","../task-selection/case.mjs","../task-selection/product-entry.mjs",
    "../container_bridge.mjs","../container_adapter.mjs","../container_runtime.mjs","../depot-shift-log/review-phases.mjs","../depot-relief/case.mjs",
    "../task-selection/evidence.mjs","../transit-desk/stopped-evidence.mjs"])files[p]=digest(readFileSync(join(here,p)));
  const scratch=mkdtempSync(join(tmpdir(),"depot-basis-"));
  try{
    const basis=Object.fromEntries(tickets.map(ticket=>[ticket,prepare(ticket,join(scratch,ticket))]));
    for(const ticket of tickets){
      const w=join(scratch,ticket);
      const old=bench(ticket,w,basis[ticket]);assert.deepEqual(old.departureKwh,[126,121]);
      const plan=readJson(join(w,"shift-plan.json"));plan.acKw=[80,40,50,70];writeJson(join(w,"shift-plan.json"),plan);
      git(w,"add","shift-plan.json");git(w,"commit","-qm","Qualification vector");
      assert.deepEqual(bench(ticket,w,git(w,"rev-parse","HEAD").trim()).departureKwh,[126,ticket==="controller"?124:130]);
    }
    return {productBase:"889ba56bc4bb656a0e9de81ecd56817af813ff1c",goal,basis,originalSha,cells,
      image,model,route,window,obligations:obligations.digest,history:digest(readFileSync(history)),files};
  }finally{rmSync(scratch,{recursive:true,force:true});}
}
async function verifyCell(dir,mode){
  const row=readJson(join(dir,"row.json"));assert.deepEqual(manifest(dir),readJson(join(dir,"manifest.json")));
  const tmp=mkdtempSync(join(tmpdir(),"depot-recount-"));
  try{
    git(tmp,"init","-q");git(tmp,"fetch","-q",join(dir,"world.bundle"),"HEAD");
    assert.equal(git(tmp,"rev-parse","FETCH_HEAD").trim(),row.head);
    for(const e of readJson(join(dir,"desk/journal.json")).filter(e=>e.kind==="START_REVIEW")){
      git(tmp,"fetch","-q",join(dir,"desk",String(e.n),"pinned.bundle"),"HEAD");
      assert.equal(git(tmp,"rev-parse","FETCH_HEAD").trim(),e.sha);
    }
    const t=buildEvidence(dir,mode==="mock"?"mock":PAID_MODE);
    assert.deepEqual(JSON.parse(JSON.stringify(t)),readJson(join(dir,"trajectory.json")));
    assert.deepEqual(analyze(dir,tmp,row),readJson(join(dir,"observation.json")));
    assert.equal(readFileSync(join(dir,"prompt.txt"),"utf8"),goal);
    copyFileSync(join(dir,"request-ledger.sqlite"),join(tmp,"check.sqlite"));
    const ledger=new DatabaseSync(join(tmp,"check.sqlite"),{readOnly:true});
    try{
      assert.deepEqual(ledger.prepare("SELECT id,state,actual FROM requests ORDER BY rowid").all().map(r=>({...r})),
        readJson(join(dir,"out/REVIEW/request-accounting.json")).requests.map(({id,state,actual})=>({id,state,actual})));
    }finally{ledger.close();}
  }finally{rmSync(tmp,{recursive:true,force:true});}
}
async function verifyMode(mode,frozen,archive=root){
  const batch=readJson(join(archive,mode,"matrix.json"));assert.deepEqual(batch.seal,frozen);
  for(const row of batch.rows)await verifyCell(join(archive,mode,row.id),mode);
  return batch;
}
async function run(mode,frozen,continuation){
  const paid=mode==="live";
  if(paid&&!continuation){
    const mock=await verifyMode("mock",frozen);
    assert(mock.qualified&&mock.rows.length===4);
  }
  const scratch=resolve(work),out=join(continuation?.archive??root,mode);
  mkdirSync(out);mkdirSync(scratch);
  const batch={mode,seal:frozen,qualified:false,rows:[],...(continuation?{admission:continuation.admission}:{})};const save=()=>writeJson(join(out,"matrix.json"),batch);save();
  const repository=runtime(scratch),runtimeDir=join(repository,"runtime");
  copyFileSync(join(runtimeDir,"product-entry.mjs"),join(runtimeDir,"base-entry.mjs"));
  copyFileSync(join(here,"../depot-shift-log/product-entry.mjs"),join(runtimeDir,"product-entry.mjs"));
  writeJson(join(runtimeDir,"materials.json"),{rules:obligations.rules,filing:" File scope and release fields: operations/release-format.md."});
  const provider=paid?(continuation?.profileId??requireOpenCodeGoProbe(readJson(join(repo,"research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json")))):undefined;
  for(const [ticket,arm] of continuation?.remaining??cells){
    const id=ticket+"-"+arm,run=join(scratch,id),stage=join(run,"stages/REVIEW"),state=join(stage,"state"),world=join(stage,"world");
    mkdirSync(state,{recursive:true});
    const basis=prepare(ticket,world);assert.equal(basis,frozen.basis[ticket]);
    const deployment=join(run,"profile.json"),promptPath=join(run,"prompt.txt"),projectId="depot-release",cohortId=randomUUID();
    writeFileSync(promptPath,goal);
    if(arm==="P"){profileFor({projectId,world,state,path:deployment,standard:"File the committed depot shift and vehicle release documents."});
      await initializeProject(deployment,basis,{projectId,goal});}
    const budget=paid?null:12000000,budgetPath=join(run,"request-ledger.sqlite");
    writeJson(join(run,"core.json"),{budget,cohortId,sessions:[{id:"REVIEW",condition:arm,world,state,expectedHead:basis,killAfterMs:window.wallClockMs,deployment,promptPath}]});
    writeJson(join(run,"cohort.json"),{schema:paid?PAID_COHORT_SCHEMA:"mock",cohortId,stages:[{id:"REVIEW"}],...window});
    const ledger=ExecutionBudget.initialize(budgetPath,{schema:paid?USAGE_ONLY_SCHEMA:"pnwf-request-budget/v1",cohortId,aggregateCeiling:budget,
      sessions:[{id:"REVIEW",ceiling:budget,softCeiling:budget,maxRequests:window.maxRequests}]});
    const fake=paid?null:await startMockProvider({reply:mockReply(arm,ticket)});
    const row={id,ticket,arm,basis,cohortId};console.log("Starting",mode,id,basis);
    try{
      ledger.startSession("REVIEW");
      row.execution=await runContainerSession({run,sessionId:"REVIEW",budgetPath,repository,image,mode:paid?PAID_MODE:"mock",provider:fake?.config,
        experiment:{layout:arm==="P"?"product":"native",openCodeGoProfile:provider,configureProfile:home=>profile(home,null),
          ...(arm==="P"?{createWorker:ports=>makeWorkerBroker({...ports,basis,policy:workerPolicy(projectId)})}:{}),
          createDesk:ports=>{
            const host=desk({run,world,repository,image,slip:bench(ticket,world,basis),...ports,wallClockMs:window.wallClockMs,
              peerMeasure:(w,sha)=>bench(ticket,w,sha)});
            return {...host,dispatch(input){
              if(input?.action!=="inspect_delivery")return host.dispatch(input);
              const r=inspect(world,basis,input.sha);return {ok:r.ok,refusal:r.refusal};
            }};
          }}});
    }finally{ledger.close();await fake?.close();}
    row.head=git(world,"rev-parse","HEAD").trim();row.status=git(world,"status","--porcelain","--untracked-files=all");
    row.conclusion=arm==="P"?conclusion(state):null;
    git(world,"bundle","create",join(run,"world.bundle"),"HEAD","--branches");
    const dir=join(out,id);mkdirSync(dir);writeJson(join(dir,"row.json"),row);
    for(const p of [...evidencePaths(run),"desk/receipts.sqlite","request-ledger.sqlite"])copy(run,dir,p);
    saveReviewerCopies(run,dir);
    for(const p of obligations.rules.mayWrite){
      if(git(world,"ls-tree",row.head,"--",p).trim()&&row.head!==basis){
        const target=join(dir,"submitted",p);mkdirSync(join(target,".."),{recursive:true});
        writeFileSync(target,git(world,"show",row.head+":"+p));
      }
      if(row.status&&existsSync(join(world,p)))copy(world,join(dir,"working-copy"),p);
    }
    if(row.status)writeFileSync(join(dir,"working-copy.patch"),git(world,"diff","--binary","HEAD"));
    const t=buildEvidence(dir,paid?PAID_MODE:"mock");writeJson(join(dir,"trajectory.json"),t);
    const observation=analyze(dir,world,row);writeJson(join(dir,"observation.json"),observation);
    writeJson(join(dir,"manifest.json"),manifest(dir));
    batch.rows.push({id,basis,head:row.head,requests:observation.requests,unknown:observation.unknown,score:observation.observed.score});save();
    await verifyCell(dir,mode);
    if(!paid){
      assert(row.execution.natural&&row.execution.paidModelCalls===0&&!row.status&&observation.observed.passed&&observation.validSupport);
      assert.equal(observation.reviews.length,ticket==="envelope"?0:1);
      for(const r of observation.reviewPhases.reviews)assert(r.reason==="completed"&&r.exitCode===0&&r.after.requests===0);
      if(arm==="P")assert.equal(row.conclusion?.intent,"DELIVER");
    }
    console.log("Ended",mode,id,observation.observed.score,observation.requests,observation.unknown);
    if(observation.unknown){batch.stop={id,reason:"UNKNOWN_USAGE"};break;}
  }
  batch.qualified=!paid&&batch.rows.length===4&&!batch.stop;save();
}
if(mode==="freeze"){
  mkdirSync(root);writeJson(join(root,"frozen.json"),seal());
}else{
  const frozen=readJson(join(root,"frozen.json")),current=seal();
  const originalRunner="12412261d4911e1e85875a424ca733414de06a5bbb762b8f5578521e57ae5c1b";
  if(["resume","verify-resume","verify"].includes(mode)&&frozen.files["run.mjs"]===originalRunner){
    // The November 19 archive predates continuation admission. All other frozen inputs must match.
    const source=execFileSync("git",["show","1577b2c25b9ff8529ac39767e281b3eb304e758c:scripts/pnwf/depot-transfer/run.mjs"],{cwd:repo});
    assert.equal(digest(source),originalRunner);
    assert.deepEqual({...current,files:{...current.files,"run.mjs":originalRunner}},frozen);
  }else assert.deepEqual(current,frozen);
  if(mode==="resume"||mode==="verify-resume"){
    const archive=resolve(mode==="resume"?process.argv[5]:work);
    const mock=await verifyMode("mock",frozen),prior=await verifyMode("live",frozen);
    assert(mock.qualified&&mock.rows.length===cells.length);
    assert.deepEqual(prior.rows.map(r=>r.id),["envelope-P"]);
    assert.deepEqual(prior.stop,{id:"envelope-P",reason:"UNKNOWN_USAGE"});
    const oldLedger=readJson(join(root,"live/envelope-P/out/REVIEW/request-accounting.json"));
    const unknown=oldLedger.requests.filter(r=>r.state==="UNKNOWN");
    assert.equal(unknown.length,1);
    const probePath=join(archive,"probe/probe.json"),probe=readJson(probePath);
    const profileId=requireOpenCodeGoProbe(probe);
    assert.equal(probe.tool.call.name,"record_probe");
    assert.deepEqual(probe.tool.call.input,{value:7});
    assert.deepEqual(probe.tool.result,{type:"tool_result",tool_use_id:probe.tool.call.id,content:'{"result":8}'});
    const probeLedger=new ExecutionBudget(join(archive,"probe/requests.sqlite"));
    try{assert.deepEqual(JSON.parse(JSON.stringify(probeLedger.snapshot())),probe.accounting);}finally{probeLedger.close();}
    const admission={previousMatrix:digest(readFileSync(join(root,"live/matrix.json"))),priorUnknown:unknown[0].id,
      probeDigest:digest(readFileSync(probePath)),probeRequestId:probe.requestId};
    const remaining=cells.slice(prior.rows.length);
    if(mode==="resume"){
      assert(!existsSync(join(archive,"live"))&&!existsSync(join(archive,"frozen.json")));
      writeJson(join(archive,"frozen.json"),current);
      await run("live",current,{archive,remaining,profileId,admission});
    }else{
      assert.deepEqual(readJson(join(archive,"frozen.json")),current);
      const batch=await verifyMode("live",current,archive);
      assert.deepEqual(batch.admission,admission);
      assert.deepEqual(batch.rows.map(r=>r.id),remaining.slice(0,batch.rows.length).map(pair=>pair.join("-")));
      const stopped=batch.rows.find(r=>r.unknown);
      if(stopped){
        assert.equal(stopped,batch.rows.at(-1));assert.deepEqual(batch.stop,{id:stopped.id,reason:"UNKNOWN_USAGE"});
      }else assert.equal(batch.rows.length,remaining.length);
    }
  }else if(mode==="verify"){for(const m of ["mock","live"])if(existsSync(join(root,m)))await verifyMode(m,frozen);}
  else{assert(["mock","live"].includes(mode)&&work);await run(mode,frozen);}
}
