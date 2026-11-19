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
import {here,history,previous,maintainer,goal,prepare,grade,measure,profile} from "./case.mjs";
import {desk} from "./desk.mjs";
import {mockReply} from "./mock.mjs";
import {oldRequest} from "./isolate-unknown.mjs";

const [mode,path,qualifiedPath]=process.argv.slice(2);
assert(["mock","live"].includes(mode)&&path);
const paid=mode==="live",root=resolve(path),id="REVIEW";
const {image,window,route,model}=previousContract;
const seal={base:"ee8b2fb5f3c9b60d533aebe5951fac2df90a18d3",previous,maintainer,history:digest(readFileSync(history)),goal,
  image,window,route,model,files:{}};
for(const p of ["protocol.md","case.mjs","rig.mjs","desk.mjs","mock.mjs","run.mjs","evidence.mjs","plugin/index.js","plugin/package.json","isolate-unknown.mjs",
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
for(const arm of ["P","F"]){
  const run=join(root,arm),stage=join(run,"stages",id),state=join(stage,"state"),world=join(stage,"world");
  mkdirSync(state,{recursive:true});
  const basis=prepare(world),slip=measure(world,basis);
  assert.deepEqual(slip.actual,[80,40,60,50]);assert.deepEqual(slip.departureKwh,[126,125.5]);
  if(summary.arms.length)assert.equal(basis,summary.arms[0].basis);
  if(paid)assert.equal(basis,qualification.arms.find(a=>a.arm===arm).basis);
  const promptPath=join(run,"prompt.txt"),deployment=join(run,"profile.json"),cohortId=randomUUID();
  writeFileSync(promptPath,goal);writeJson(join(run,"previous-shift-slip.json"),slip);
  const row={arm,basis,cohortId,promptDigest:digest(goal),priorGrade:grade(world,basis,basis)};
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
  const mock=paid?null:await startMockProvider({reply:mockReply(arm,basis)});
  try{
    ledger.startSession(id);
    row.execution=await runContainerSession({run,sessionId:id,budgetPath,repository,image,mode:paid?PAID_MODE:"mock",provider:mock?.config,
      experiment:{layout:arm==="P"?"product":"native",openCodeGoProfile:provider,configureProfile:home=>profile(home,null),
        ...(arm==="P"?{createWorker:ports=>makeWorkerBroker({...ports,basis,policy:workerPolicy(projectId)})}:{}),
        createDesk:ports=>desk({run,world,repository,image,slip,...ports})}});
    row.head=git(world,"rev-parse","HEAD").trim();row.status=git(world,"status","--porcelain","--untracked-files=all");
    row.grade=grade(world,basis,row.head);row.journal=arm==="P"?conclusion(state):null;
    git(world,"bundle","create",join(run,"world.bundle"),"HEAD","--branches");
    const snapshot=ledger.snapshot();
    row.requests=snapshot.requests.length;row.confirmed=snapshot.confirmed;row.unknown=snapshot.unresolvedRequests;row.stop=snapshot.reason;
    const {buildEvidence}=await import("./evidence.mjs");
    const t=buildEvidence(run,paid?PAID_MODE:"mock");writeJson(join(run,"trajectory.json"),t);
    if(!paid){
      assert(row.execution.natural&&row.grade.passed&&!row.status&&row.execution.paidModelCalls===0);
      const c=t.traces.find(s=>s.role==="principal").calls;
      assert(c.some(x=>x.tool==="depot_trial"&&x.reply.includes("Current full candidate")));
      assert(c.some(x=>x.reply.includes("125.5")));
      assert.equal(t.traces.some(s=>s.role==="maintainer"),arm==="P");
      if(arm==="P")assert(readJson(join(run,"desk/journal.json")).some(e=>e.kind==="RETURN"&&e.receipt.sha===basis));
    }
    console.log("Ended",mode,arm,row.execution.natural,row.grade.passed,row.requests,row.unknown);
  }catch(e){row.error=e.stack;console.error(row.error);process.exitCode=1;}
  finally{ledger.close();if(mock)await mock.close();save();}
  if(row.error||row.unknown||!row.requests)break;
}
summary.qualified=!paid&&summary.arms.length===2&&summary.arms.every(r=>!r.error&&r.grade?.passed&&r.execution?.natural);
save();
