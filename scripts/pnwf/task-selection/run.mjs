import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {parseArgs} from "node:util";
import {ExecutionBudget,USAGE_ONLY_SCHEMA} from "../execution_budget.mjs";
import {PAID_COHORT_SCHEMA,PAID_MODE} from "../bounded_provider.mjs";
import {runContainerSession} from "../container_adapter.mjs";
import {startMockProvider} from "../mock_provider.mjs";
import {requireOpenCodeGoProbe} from "../opencode_go.mjs";
import {digest,head,readJson,writeJson} from "../energy/contract.mjs";
import {profileFor,initializeProject,conclusion} from "../energy/product.mjs";
import {makeWorkerBroker} from "../energy/container-worker.mjs";
import {createReviewDesk} from "../software/night-isolated/broker.mjs";
import {historyPath} from "../software/night-review/fixture.mjs";
import {projectWindow} from "../software/night-review/evidence.mjs";
import {runtime,prepare,deskProfile,workerPolicy,submission,goals,repo,here,previousContract} from "./case.mjs";
import {scenarioMock} from "./mock.mjs";
import {analyze} from "./evidence.mjs";

const {values:v}=parseArgs({options:{mode:{type:"string"},run:{type:"string"},qualification:{type:"string"}}});
assert(["mock","live"].includes(v.mode)&&v.run);
const paid=v.mode==="live",root=resolve(v.run),id="REVIEW",mode=paid?PAID_MODE:"mock";
const {window,image,model,route}=previousContract;
const cases=[["software","P"],["software","F"],["energy","F"],["energy","P"]];
const seal={base:"6d8f90c10ef3511c444cfeca36ed5d61287de16a",cases,goals,window,image,model,route,files:{}};
for(const path of ["run.mjs","case.mjs","energy.mjs","mock.mjs","evidence.mjs","product-entry.mjs","worker.js","protocol.md","../software/night-review/fixture.mjs","../software/night-isolated/contract.mjs","../software/night-isolated/broker.mjs","../software/night-isolated/mock.mjs","../container_adapter.mjs","../container_runtime.mjs","../energy/evidence.mjs","../energy/container-worker.mjs"])
  seal.files[path]=digest(readFileSync(join(here,path)));
let qualification;
if(paid){qualification=readJson(resolve(v.qualification));assert(qualification.mode==="mock"&&qualification.qualified);assert.deepEqual(seal,qualification.seal);}
mkdirSync(root);const repository=runtime(root);
const provider=paid?requireOpenCodeGoProbe(readJson(join(repo,"research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json"))):undefined;
const matrix={seal,mode:v.mode,cases:[],qualified:false};const save=()=>writeJson(join(root,"matrix.json"),matrix);save();
for(const [domain,arm] of cases){
  const run=join(root,domain+"-"+arm),out=join(run,"out",id),stage=join(run,"stages",id),world=join(stage,"world"),state=join(stage,"state");
  mkdirSync(out,{recursive:true});mkdirSync(state,{recursive:true});
  const records=join(out,"records"),basis=prepare(domain,world,records),product=arm==="P",software=domain==="software",projectId="route-"+domain;
  if(matrix.cases.some(r=>r.domain===domain))assert.equal(basis,matrix.cases.find(r=>r.domain===domain).basis);
  if(paid)assert.equal(basis,qualification.cases.find(r=>r.domain===domain&&r.arm===arm).basis);
  if(!paid){const negative=submission(domain,world,basis,run,join(run,"baseline.bundle"));assert.equal(negative.grade.passed,false);writeJson(join(run,"baseline.json"),negative);}
  const goal=goals[domain],promptPath=join(run,"prompt.txt"),deployment=join(run,"profile.json");
  writeFileSync(promptPath,goal);
  if(product){profileFor({projectId,localPeer:"pilot-principal",world,state,path:deployment});await initializeProject(deployment,basis,{projectId,goal});}
  const cohortId=randomUUID(),budget=paid?null:12000000,budgetPath=join(run,"request-ledger.sqlite");
  writeJson(join(run,"core.json"),{budget,cohortId,sessions:[{id,condition:arm,world,state,expectedHead:basis,killAfterMs:window.wallClockMs,deployment,promptPath}]});
  if(paid)writeJson(join(run,"cohort.json"),{schema:PAID_COHORT_SCHEMA,cohortId,stages:[{id}],...window});
  const ledger=ExecutionBudget.initialize(budgetPath,{schema:paid?USAGE_ONLY_SCHEMA:"pnwf-request-budget/v1",cohortId,aggregateCeiling:budget,sessions:[{id,ceiling:budget,softCeiling:budget,maxRequests:window.maxRequests}]});
  const r={domain,arm,basis,promptDigest:digest(readFileSync(promptPath))};let mock;
  try{
    if(!paid)mock=await startMockProvider({reply:scenarioMock(domain)});
    ledger.startSession(id);
    r.execution=await runContainerSession({run,sessionId:id,budgetPath,repository,image,mode,provider:mock?.config,experiment:{
      layout:product?"product":"native",openCodeGoProfile:provider,
      ...(product?{createWorker:ports=>makeWorkerBroker({...ports,basis,policy:workerPolicy(projectId)})}:{}),
      ...(software?{records,configureProfile:deskProfile,createDesk:ports=>createReviewDesk({run,world,records,repository,image,...ports})}:{})}});
    r.submission=submission(domain,world,basis,run,join(run,"submission.bundle"));if(product)r.conclusion=conclusion(state);
    if(existsSync(join(run,"review-desk/latest.zstd"))){cpSync(join(run,"review-desk/latest.zstd"),join(run,"runtime-"+id,historyPath));projectWindow(run);}
    const t=analyze(run,mode);writeJson(join(run,"trajectory.json"),t);
    const principal=t.traces.find(t=>t.role==="principal");
    assert(principal.tools.includes("subagent")&&principal.tools.includes("workflow"));assert.equal(principal.tools.includes("palimpsest_work"),product);
    if(!paid){assert(r.execution.natural&&r.execution.paidModelCalls===0&&r.submission.delivered);assert(t.traces.some(t=>t.role===(software?"maintainer":"native-child")));}
    r.accounted=true;
  }catch(e){r.error=e.stack;process.exitCode=1;}
  finally{r.ledger=ledger.snapshot();ledger.close();if(mock){r.mockFailures=mock.failures;await mock.close();}
    writeJson(join(run,"result.json"),r);matrix.cases.push({domain,arm,basis,accounted:r.accounted??false,natural:r.execution?.natural,passed:r.submission?.delivered,requests:r.ledger.requests.length,error:r.error});save();console.log(JSON.stringify(matrix.cases.at(-1)));}
  if(!r.accounted)break;
}
matrix.qualified=matrix.cases.length===cases.length&&matrix.cases.every(c=>c.accounted);save();
