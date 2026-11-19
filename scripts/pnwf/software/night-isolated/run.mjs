import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {PAID_COHORT_SCHEMA,PAID_MODE} from "../../bounded_provider.mjs";
import {ExecutionBudget,USAGE_ONLY_SCHEMA} from "../../execution_budget.mjs";
import {runContainerSession} from "../../container_adapter.mjs";
import {startMockProvider} from "../../mock_provider.mjs";
import {requireOpenCodeGoProbe} from "../../opencode_go.mjs";
import {digest,git,head,clean,readJson,writeJson} from "../../energy/contract.mjs";
import {initializeProject,profileFor} from "../../energy/product.mjs";
import {stageSoftwareRuntime,isolated} from "../run.mjs";
import {archive,basis,previous,history,historyPath,maintainer,prompt as goal,grade} from "../night-review/fixture.mjs";
import {here,recordsAt,prepareWorld,profile} from "./contract.mjs";
import {createReviewDesk} from "./broker.mjs";
const prompt=goal+" The dispatch desk publishes its capture catalogue and replay contract in /run/dispatch-records.";
import {id,analyze,projectWindow} from "../night-review/evidence.mjs";
import {mockReply} from "./mock.mjs";

const {values:v}=parseArgs({options:{run:{type:"string"},mode:{type:"string"},qualification:{type:"string"}}});
assert(v.run && ["mock","live"].includes(v.mode));
const root=resolve(v.run),paid=v.mode==="live",repo=fileURLToPath(new URL("../../../../",import.meta.url));
const prior=readJson(join(archive,"matrix.json")).seal;
const seal={basis,previous,maintainer,historyDigest:digest(readFileSync(history)),prompt,image:prior.image,window:prior.window,model:prior.model,route:prior.route,
  cases:["auto","solo"],inputs:Object.fromEntries(["../night-review/fixture.mjs","../night-review/evidence.mjs","../../container_adapter.mjs","../../container_runtime.mjs","broker.mjs","contract.mjs","mock.mjs","plugin/index.js","plugin/package.json","run.mjs"].map(p=>[p,digest(readFileSync(join(here,p)))]))};
if(paid){const q=readJson(resolve(v.qualification));assert(q.qualified&&q.mode==="mock");assert.deepEqual(q.seal,seal);}
mkdirSync(root);const runtime=join(root,"runtime");stageSoftwareRuntime(repo,runtime);
const provider=paid?requireOpenCodeGoProbe(readJson(join(repo,"research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json"))):undefined;
const matrix={seal,mode:v.mode,cases:[],qualified:false};
writeJson(join(root,"matrix.json"),matrix);
const frozen=grade(join(archive,"redraw-solo/project.bundle"),basis,seal.image);
assert.deepEqual(frozen.checks.map(x=>x.passed),[true,false]);writeJson(join(root,"baseline-grade.json"),frozen);
for(const arm of seal.cases){
  const solo=arm==="solo",run=join(root,arm),stage=join(run,"stages",id),world=join(stage,"world");
  const records=join(run,"out",id,"records");mkdirSync(join(run,"out",id),{recursive:true});const captures=recordsAt(records);
  prepareWorld(world,records);writeFileSync(join(world,".git/principal-only"),"principal");const state=join(stage,"state"),deployment=join(run,"profile.json");mkdirSync(state);
  const project={projectId:"dispatch-replay-review",localPeer:"review-principal",goal:prompt};
  profileFor({...project,world,state,path:deployment});await initializeProject(deployment,basis,project);
  const mode=paid?PAID_MODE:"mock",cohortId=randomUUID(),budget=paid?null:12000000,promptPath=join(run,"prompt.txt");
  writeFileSync(promptPath,prompt);
  writeJson(join(run,"core.json"),{cohortId,budget,sessions:[{id,condition:"P",world,state,expectedHead:basis,killAfterMs:seal.window.wallClockMs,deployment,promptPath}]});
  if(paid)writeJson(join(run,"cohort.json"),{schema:PAID_COHORT_SCHEMA,cohortId,stages:[{id}],...seal.window});
  const budgetPath=join(run,"request-ledger.sqlite"),ledger=ExecutionBudget.initialize(budgetPath,{schema:paid?USAGE_ONLY_SCHEMA:"pnwf-request-budget/v1",cohortId,aggregateCeiling:budget,sessions:[{id,ceiling:budget,softCeiling:budget,maxRequests:seal.window.maxRequests}]});
  const r={arm,mode,basis};let mock;
  try{
    if(!paid)mock=await startMockProvider({reply:mockReply(solo)});
    ledger.startSession(id);
    r.execution=await runContainerSession({run,sessionId:id,budgetPath,repository:runtime,image:seal.image,mode,provider:mock?.config,
      experiment:{layout:"product",openCodeGoProfile:provider,records,configureProfile:home=>profile(home,"principal",!solo),
        createDesk:solo?undefined:ports=>createReviewDesk({run,world,records,repository:runtime,image:seal.image,...ports})}});
    r.isolation=isolated(readJson(join(run,"out",id,"qualification.json")));
    r.head=head(world);r.clean=clean(world);r.changed=git(world,"diff","--name-only",basis,r.head).split("\n").filter(Boolean);
    git(world,"bundle","create",join(run,"project.bundle"),"HEAD", "refs/remotes/dispatch/previous-shift");
    r.grade=grade(join(run,"project.bundle"),r.head,seal.image);
    for(const [event,c] of Object.entries(captures))assert.equal(digest(readFileSync(join(records,event+".tsv"))),c.sha256);
    assert.equal(readFileSync(join(world,".git/principal-only"),"utf8"),"principal");
    const latest=join(run,"review-desk/latest.zstd");cpSync(existsSync(latest)?latest:history,join(run,"runtime-"+id,historyPath));
    projectWindow(run);const analysis=analyze(run,mode);writeJson(join(run,"trajectory.json"),analysis);
    const principal=analysis.traces.find(t=>t.role==="principal");
    assert(principal.tools.includes("fleet_register")&&principal.tools.includes("fleet_contact")===!solo&&!principal.tools.includes("subagent"));
    if(solo)assert.equal(analysis.traces.length,1);
    if(!paid){
      assert(r.execution.natural&&r.execution.paidModelCalls===0&&r.grade.passed&&r.head!==basis&&r.clean);
      assert.deepEqual(analysis.traces.map(t=>t.role).sort(),solo?["principal"]:["principal","resumed-maintainer"]);
      if(!solo){
        const contacts=principal.calls.filter(c=>c.tool==="fleet_contact");
        assert.equal(contacts.length,2);assert.match(contacts[0].reply,/Current candidate SHA required/);
        const reply=JSON.parse(contacts[1].reply);
        assert.deepEqual(Object.keys(reply).sort(),["measurements","ok","session","sha"]);assert.equal(reply.sha,basis);assert.equal(reply.session,maintainer);
        assert.deepEqual(reply.measurements.map(m=>[m.capture,m.sha,m.exit,m.reproduced,m.p17At40]),[["P",basis,0,true,true],["S",basis,0,true,true]]);
        const reviewer=analysis.traces.find(t=>t.role==="resumed-maintainer");
        assert(reviewer.calls.some(c=>c.tool==="bash"&&c.reply.includes("denials confirmed")));
        assert(reviewer.tools.includes("fleet_measure")&&!reviewer.tools.includes("palimpsest_work"));
      }
    }
    r.accounted=true;
  }catch(e){r.error=e.stack;process.exitCode=1;}
  finally{r.ledger=ledger.snapshot();ledger.close();if(mock){r.mockFailures=mock.failures;await mock.close();}
    writeJson(join(run,"result.json"),r);matrix.cases.push({arm,accounted:r.accounted??false,natural:r.execution?.natural,approvedChecks:r.grade?.checks.map(c=>c.passed),requests:r.ledger.requests.length,error:r.error});
    writeJson(join(root,"matrix.json"),matrix);console.log(JSON.stringify(matrix.cases.at(-1)));}
  if(!r.accounted)break;
}
matrix.qualified=matrix.cases.length===2&&matrix.cases.every(c=>c.accounted);writeJson(join(root,"matrix.json"),matrix);
