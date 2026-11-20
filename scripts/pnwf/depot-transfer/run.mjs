import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,writeFileSync} from "node:fs";
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
import {inspectRelease,measuredBench,measurement,r4Authority} from "./release-power.mjs";
import {releaseMock} from "./release-mock.mjs";

const [action,path,work]=process.argv.slice(2),root=resolve(path),here=fileURLToPath(new URL("./",import.meta.url));
const fullWindow=action.startsWith("r4-window-"),r4=action.startsWith("r4-"),powerGate=r4||action.startsWith("r7-");
const mode=fullWindow?action.slice("r4-window-".length):powerGate?action.slice(3):action;
const checkRelease=(world,basis,sha)=>inspectRelease(world,basis,sha,{requireFullWindow:fullWindow});
const ticket=r4?"envelope":"controller";
const cells=powerGate?[[ticket,"P"],[ticket,"F"]]:[["envelope","P"],["envelope","F"],["controller","F"],["controller","P"]];
const {image,window,route,model}=previousContract;
function seal(){
  const files={};
  for(const p of ["run.mjs","case.mjs","protocol.md","mock.mjs","analyze.mjs","../depot-shift-log/desk.mjs","../depot-shift-log/case.mjs",
    "../depot-shift-log/product-entry.mjs","../depot-shift-log/review-entry.mjs","../depot-shift-log/review-trial.mjs","../depot-shift-log/receipt-store.mjs",
    "../depot-relief/plugin/index.js","../depot-relief/evidence.mjs","../depot-relief/rig.mjs","../depot-relief/archive.mjs","../task-selection/case.mjs","../task-selection/product-entry.mjs",
    "../container_bridge.mjs","../container_adapter.mjs","../container_runtime.mjs","../depot-shift-log/review-phases.mjs","../depot-relief/case.mjs",
    "../task-selection/evidence.mjs","../transit-desk/stopped-evidence.mjs"])files[p]=digest(readFileSync(join(here,p)));
  if(powerGate)for(const p of ["release-power.mjs","release-mock.mjs","release-plugin.mjs","release-power.test.mjs","release-protocol.md"]){
    files[p]=digest(readFileSync(join(here,p)));
  }
  if(r4)for(const p of ["r4-release.test.mjs","r4-protocol.md"])files[p]=digest(readFileSync(join(here,p)));
  if(fullWindow)for(const p of ["window.test.mjs","window-protocol.md"])files[p]=digest(readFileSync(join(here,p)));
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
    return {productBase:fullWindow?"dda9cde829440f8b58495cea367e4a68a18e8745":r4?"a819db596e2297f7e7b0f9bc946cb1b2cc8eb477":powerGate?"705d1be2":"889ba56bc4bb656a0e9de81ecd56817af813ff1c",goal,basis,originalSha,cells,
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
    assert.deepEqual(analyze(dir,tmp,row,powerGate?measuredBench:bench),readJson(join(dir,"observation.json")));
    if(powerGate&&!row.status){
      git(tmp,"checkout","-q","--detach",row.head);
      assert.deepEqual(checkRelease(tmp,row.basis,row.head),row.release.check);
      assert.equal(row.release.filed,row.release.check.ok&&row.execution.natural&&(row.arm==="F"||row.conclusion?.intent==="DELIVER"));
    }
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
    assert(mock.qualified&&mock.rows.length===cells.length);
  }
  const scratch=resolve(work),out=join(continuation?.archive??root,mode);
  mkdirSync(out);mkdirSync(scratch);
  const batch={mode,seal:frozen,qualified:false,rows:[],...(continuation?{admission:continuation.admission}:{})};const save=()=>writeJson(join(out,"matrix.json"),batch);save();
  const repository=runtime(scratch),runtimeDir=join(repository,"runtime");
  copyFileSync(join(runtimeDir,"product-entry.mjs"),join(runtimeDir,"base-entry.mjs"));
  copyFileSync(join(here,"../depot-shift-log/product-entry.mjs"),join(runtimeDir,"product-entry.mjs"));
  writeJson(join(runtimeDir,"materials.json"),{rules:obligations.rules,filing:" File scope and release fields: operations/release-format.md."});
  const probeFile=powerGate?"research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/probe/probe.json":"research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json";
  const provider=paid?(continuation?.profileId??requireOpenCodeGoProbe(readJson(join(repo,probeFile)))):undefined;
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
    const fake=paid?null:await startMockProvider({reply:(powerGate?releaseMock:mockReply)(arm,ticket,fullWindow)});
    const checks=[];
    const row={id,ticket,arm,basis,cohortId};console.log("Starting",mode,id,basis);
    try{
      ledger.startSession("REVIEW");
      row.execution=await runContainerSession({run,sessionId:"REVIEW",budgetPath,repository,image,mode:paid?PAID_MODE:"mock",provider:fake?.config,
        experiment:{layout:arm==="P"?"product":"native",openCodeGoProfile:provider,configureProfile:home=>{
          profile(home,null);
          if(powerGate){
            const plugin=join(home,"profiles/node_modules/depot-shift-desk");
            renameSync(join(plugin,"index.js"),join(plugin,"desk.js"));
            copyFileSync(join(here,"release-plugin.mjs"),join(plugin,"index.js"));
            if(fullWindow)writeJson(join(plugin,"filing.json"),{authority:r4Authority});
          }
        },
          ...(arm==="P"?{createWorker:ports=>makeWorkerBroker({...ports,basis,policy:workerPolicy(projectId)})}:{}),
          createDesk:ports=>{
            const measure=powerGate?measuredBench:bench;
            const host=desk({run,world,repository,image,slip:measure(ticket,world,basis),...ports,wallClockMs:window.wallClockMs,
              peerMeasure:(w,sha)=>measure(ticket,w,sha)});
            return {...host,async dispatch(input){
              if(powerGate&&["inspect_delivery","release_check"].includes(input?.action)){
                const result=checkRelease(world,basis,input.sha);
                checks.push({action:input.action,sha:input.sha,result});
                return result;
              }
              if(input?.action!=="inspect_delivery"){
                const result=await host.dispatch(input);
                if(powerGate&&input.action==="trial"&&result.ok){
                  return {...result,receipt:measurement(result.receipt),scope:fullWindow?r4Authority:"21:00 local replay only; filing uses the applicable duty limits."};
                }
                return result;
              }
              const r=inspect(world,basis,input.sha);return {ok:r.ok,refusal:r.refusal};
            }};
          }}});
    }finally{ledger.close();await fake?.close();}
    row.head=git(world,"rev-parse","HEAD").trim();row.status=git(world,"status","--porcelain","--untracked-files=all");
    row.conclusion=arm==="P"?conclusion(state):null;
    if(powerGate){
      const check=checkRelease(world,basis,row.head);
      row.release={check,filed:check.ok&&row.execution.natural&&(arm==="F"||row.conclusion?.intent==="DELIVER"),checks};
    }
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
    const observation=analyze(dir,world,row,powerGate?measuredBench:bench);writeJson(join(dir,"observation.json"),observation);
    writeJson(join(dir,"manifest.json"),manifest(dir));
    batch.rows.push({id,basis,head:row.head,requests:observation.requests,unknown:observation.unknown,score:observation.observed.score});save();
    await verifyCell(dir,mode);
    if(!paid){
      assert(row.execution.natural&&row.execution.paidModelCalls===0&&!row.status&&observation.observed.passed&&observation.validSupport);
      assert.equal(observation.reviews.length,ticket==="envelope"?0:1);
      for(const r of observation.reviewPhases.reviews)assert(r.reason==="completed"&&r.exitCode===0&&r.after.requests===0);
      if(arm==="P")assert.equal(row.conclusion?.intent,"DELIVER");
      if(powerGate)assert(row.release.filed&&checks.some(c=>c.result.refusal?.reason==="REQUEST_POWER_EXCEEDS_LIMIT"));
      if(r4)assert.equal(row.release.check.evidenceMode,"ORIGINAL_RECEIPT_REUSED");
      if(fullWindow)assert(checks.some(c=>c.result.refusal?.reason==="UNUSED_WINDOW_POWER"));
    }
    console.log("Ended",mode,id,observation.observed.score,observation.requests,observation.unknown);
    if(observation.unknown){batch.stop={id,reason:"UNKNOWN_USAGE"};break;}
  }
  batch.qualified=!paid&&batch.rows.length===cells.length&&!batch.stop;save();
}
function verifySeal(current,frozen){
  const oldR7=action==="r7-verify"&&frozen.files["run.mjs"]==="a74552a7cda20651826ac2f6ce6cc666cd86977d2e9402f1b359534419d67c8e";
  const oldR4=action==="r4-verify"&&frozen.files["run.mjs"]==="2a0ba893cc0b07a0d9bceefd8b6e2aae6089f2bb675d5a28f53a893bf0d6205b";
  if(oldR7||oldR4){
    const files={...current.files};
    for(const p of ["run.mjs","release-power.mjs","release-mock.mjs","release-plugin.mjs"]){
      files[p]=digest(execFileSync("git",["show",(oldR7?"a819db59":"dda9cde8")+":scripts/pnwf/depot-transfer/"+p],{cwd:repo}));
    }
    assert.deepEqual({...current,files},frozen);return;
  }
  if(powerGate||!["verify","verify-resume","resume"].includes(mode)){assert.deepEqual(current,frozen);return;}
  // Replay the pre-gate releases against the version that froze their runner and analyzer.
  const refs={"12412261d4911e1e85875a424ca733414de06a5bbb762b8f5578521e57ae5c1b":"1577b2c2",
    "362fc7e8ad5a8285ec7bffd1f5ace439fba5cd891ba3ac13b897e3c219245bd4":"705d1be2"};
  const ref=refs[frozen.files["run.mjs"]],files={...current.files};
  if(ref)for(const p of ["run.mjs","analyze.mjs"]){
    files[p]=digest(execFileSync("git",["show",ref+":scripts/pnwf/depot-transfer/"+p],{cwd:repo}));
  }
  assert.deepEqual({...current,files},frozen);
}
if(mode==="freeze"){
  mkdirSync(root);writeJson(join(root,"frozen.json"),seal());
}else{
  const frozen=readJson(join(root,"frozen.json")),current=seal();
  verifySeal(current,frozen);
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
      const archived=readJson(join(archive,"frozen.json"));verifySeal(current,archived);
      const batch=await verifyMode("live",archived,archive);
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
