import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
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
import {here,history,previous,maintainer,goal,prepare,grade,measure,profile,publicLog,privateLog} from "./case.mjs";
import {desk} from "./desk.mjs";
import {mockReply} from "./mock.mjs";
import {oldRequest} from "../depot-relief/isolate-unknown.mjs";

const args=process.argv.slice(2),single=args.includes("--palimpsest-only");
const [mode,path,qualifiedPath]=args.filter(arg=>arg!=="--palimpsest-only");
assert(["mock","live"].includes(mode)&&path);
const paid=mode==="live",root=resolve(path),id="REVIEW";
const {image,window,route,model}=previousContract;
const arms=single?["P"]:["P","F"];
const seal={scenario:"depot-shift-log",delivery:"durable-v1",arms,base:"d70eebc054fcf9f96154cff53d976ce13cd43725",publicDigest:digest(JSON.stringify(publicLog)),privateDigest:digest(JSON.stringify(privateLog)),previous,maintainer,history:digest(readFileSync(history)),goal,
  image,window,route,model,files:{}};
for(const p of ["protocol.md","receipt-store.mjs","receipt-store.test.mjs","case.mjs","../depot-relief/rig.mjs","desk.mjs","mock.mjs","run.mjs","../depot-relief/evidence.mjs","../depot-relief/plugin/index.js","../depot-relief/plugin/package.json","../depot-relief/isolate-unknown.mjs","../depot-relief/case.mjs",
  "../container_adapter.mjs","../container_runtime.mjs","../container_bridge.mjs","../task-selection/evidence.mjs","../task-selection/case.mjs"]){
  seal.files[p]=digest(readFileSync(join(here,p)));
}
const qualification=paid?readJson(resolve(qualifiedPath)):null;
if(paid){assert(qualification.qualified&&qualification.mode==="mock");assert.deepEqual(qualification.seal,seal);}
const provider=paid?requireOpenCodeGoProbe(readJson(join(repo,"research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json"))):undefined;
mkdirSync(root);
writeJson(join(root,"previous-unknown.json"),oldRequest());
const summary={mode,seal,qualified:false,arms:[]};
const save=()=>writeJson(join(root,"matrix.json"),summary);
save();
const repository=runtime(root);
for(const arm of arms){
  const run=join(root,arm),stage=join(run,"stages",id),state=join(stage,"state"),world=join(stage,"world");
  mkdirSync(state,{recursive:true});
  const basis=prepare(world),slip=measure(world,basis);
  assert.deepEqual(slip.actual,[80,40,50,50]);assert.deepEqual(slip.departureKwh,[126,121]);
  const publicTrial=measure(world,basis,publicLog);assert(publicTrial.withinLimits);assert.deepEqual(publicTrial.departureKwh,[126,130]);
  writeJson(join(run,"private-capture.json"),privateLog);
  if(summary.arms.length)assert.equal(basis,summary.arms[0].basis);
  if(paid)assert.equal(basis,qualification.arms.find(a=>a.arm===arm).basis);
  const promptPath=join(run,"prompt.txt"),deployment=join(run,"profile.json"),cohortId=randomUUID();
  writeFileSync(promptPath,goal);writeJson(join(run,"previous-shift-slip.json"),slip);
  const row={arm,basis,cohortId,promptDigest:digest(goal),publicTrial,priorGrade:grade(world,basis,basis)};
  assert(!row.priorGrade.passed);
  summary.arms.push(row);save();console.log("Starting",mode,arm,basis);
  const projectId="depot-release";
  if(arm==="P"){profileFor({projectId,world,state,path:deployment,standard:"Commit the executable duty sheet and the release handover."});
    await initializeProject(deployment,basis,{projectId,goal});}
  const budget=paid?null:12000000,budgetPath=join(run,"request-ledger.sqlite");
  writeJson(join(run,"core.json"),{budget,cohortId,sessions:[{id,condition:arm,world,state,expectedHead:basis,killAfterMs:window.wallClockMs,deployment,promptPath}]});
  writeJson(join(run,"cohort.json"),{schema:paid?PAID_COHORT_SCHEMA:"mock",cohortId,stages:[{id}],...window});
  const ledger=ExecutionBudget.initialize(budgetPath,{schema:paid?USAGE_ONLY_SCHEMA:"pnwf-request-budget/v1",cohortId,aggregateCeiling:budget,
    sessions:[{id,ceiling:budget,softCeiling:budget,maxRequests:window.maxRequests}]});
  const scripted=mockReply(arm,basis);
  let dropFirst=!paid;
  const mock=paid?null:await startMockProvider({reply:(req,n)=>{
    const blocks=req.messages.at(-1)?.content;
    if(Array.isArray(blocks)&&blocks.some(b=>b.type==="tool_result"&&JSON.stringify(b.content).includes("MOCK_RESPONSE_LOST"))){
      return [{type:"tool_use",id:"delivery_retry_"+n,name:"depot_contact",input:{sha:basis,question:"请再核对原班表。"}}];
    }
    return scripted(req,n);
  }});
  try{
    ledger.startSession(id);
    row.execution=await runContainerSession({run,sessionId:id,budgetPath,repository,image,mode:paid?PAID_MODE:"mock",provider:mock?.config,
      experiment:{layout:arm==="P"?"product":"native",openCodeGoProfile:provider,configureProfile:home=>profile(home,null),
        ...(arm==="P"?{createWorker:ports=>makeWorkerBroker({...ports,basis,policy:workerPolicy(projectId)})}:{}),
        createDesk:ports=>{
          const host=desk({run,world,repository,image,slip,...ports});
          if(paid)return host;
          return {...host,async dispatch(input){
            const result=await host.dispatch(input);
            if(dropFirst&&input.action==="contact"&&result.ok){dropFirst=false;throw Error("MOCK_RESPONSE_LOST");}
            return result;
          }};
        }}});
    row.head=git(world,"rev-parse","HEAD").trim();row.status=git(world,"status","--porcelain","--untracked-files=all");
    row.grade=grade(world,basis,row.head);row.journal=arm==="P"?conclusion(state):null;
    git(world,"bundle","create",join(run,"world.bundle"),"HEAD","--branches");
    const snapshot=ledger.snapshot();
    row.requests=snapshot.requests.length;row.confirmed=snapshot.confirmed;row.unknown=snapshot.unresolvedRequests;row.stop=snapshot.reason;
    const {buildEvidence}=await import("../depot-relief/evidence.mjs");
    const t=buildEvidence(run,paid?PAID_MODE:"mock");writeJson(join(run,"trajectory.json"),t);
    if(!paid){
      assert(row.execution.natural&&row.grade.passed&&!row.status&&row.execution.paidModelCalls===0);
      const c=t.traces.find(s=>s.role==="principal").calls;
      assert(c.some(x=>x.tool==="depot_trial"&&x.reply.includes("Current full candidate")));
      const calls=c.filter(x=>x.tool==="depot_contact");
      assert.equal(calls.length,3);
      assert(calls[0].reply.includes("MOCK_RESPONSE_LOST"));
      assert.deepEqual(JSON.parse(calls[1].reply).receipt,slip);
      assert(c.filter(x=>x.seq<calls[0].seq).every(x=>!x.reply.includes(privateLog.run)));
      const journal=readJson(join(run,"desk/journal.json"));
      const self=journal.find(e=>e.kind==="SELF_TRIAL");
      assert.deepEqual(self.receipt,publicTrial);
      const returns=journal.filter(e=>e.kind==="RETURN");
      assert.equal(returns.length,3);assert.deepEqual(returns[0].receipt,slip);
      assert.deepEqual(returns[1].receipt,slip);
      assert.equal(journal.filter(e=>e.kind==="START_REVIEW"&&e.sha===basis).length,1);
      assert.equal(journal.filter(e=>e.kind==="START_REVIEW").length,2);
      assert.deepEqual(returns[0].principal.acKw,[80,40,70,50]);
      assert.deepEqual(returns[2].receipt.departureKwh,[126,130]);
      assert.deepEqual(returns[2].principal.acKw,[80,40,50,70]);
      assert(t.traces.find(s=>s.role==="maintainer").calls.some(x=>x.tool==="depot_shift_log"&&x.reply.includes(privateLog.run)));
    }
    console.log("Ended",mode,arm,row.execution.natural,row.grade.passed,row.requests,row.unknown);
  }catch(e){row.error=e.stack;console.error(row.error);process.exitCode=1;}
  finally{ledger.close();if(mock)await mock.close();save();}
  if(row.error||row.unknown||!row.requests)break;
}
summary.qualified=!paid&&summary.arms.length===arms.length&&summary.arms.every(r=>!r.error&&r.grade?.passed&&r.execution?.natural);
save();
