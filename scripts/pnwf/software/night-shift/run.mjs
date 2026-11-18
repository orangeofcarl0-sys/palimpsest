import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {PAID_COHORT_SCHEMA,PAID_MODE} from "../../bounded_provider.mjs";
import {ExecutionBudget,USAGE_ONLY_SCHEMA} from "../../execution_budget.mjs";
import {runContainerSession} from "../../container_adapter.mjs";
import {startMockProvider} from "../../mock_provider.mjs";
import {analyzeAttributedStage,readStream} from "../../analyze_energy_trajectory.mjs";
import {OPENCODE_GO_MESSAGES,requireOpenCodeGoProbe} from "../../opencode_go.mjs";
import {attribute} from "../../energy/evidence.mjs";
import {digest,git,head,clean,readJson,writeJson} from "../../energy/contract.mjs";
import {initializeProject,profileFor} from "../../energy/product.mjs";
import {stageSoftwareRuntime,isolated} from "../run.mjs";
import {prepare} from "./case.mjs";
import {installDesk,deskPort} from "./port.mjs";
import {nightMock} from "./mock.mjs";

const {values:v}=parseArgs({options:{run:{type:"string"},mode:{type:"string"},qualification:{type:"string"}}});
assert(v.run && ["mock","live"].includes(v.mode));
const root=resolve(v.run), paid=v.mode==="live", id="NIGHT";
const repo=fileURLToPath(new URL("../../../../",import.meta.url));
const frozen=readJson(join(repo,"research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/contract.json")).seal;
const prompt="Handle the overnight dispatch handover described in SHIFT.md. Leave the next shift a runnable replay, a committed handover and a dry-run booking receipt for a practical morning plan. Production changes belong to the release owner.";
const paths=["scripts/pnwf/software/night-shift","fixtures/psvr/fleet-night-shift"].flatMap(dir=>readdirSync(join(repo,dir),{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>join(e.parentPath,e.name).slice(repo.length).replaceAll("\\","/"))).filter(p=>!p.endsWith("test.mjs")&&!p.endsWith("archive.mjs"));
const seal={provider:"opencode-go",route:OPENCODE_GO_MESSAGES,model:frozen.model,image:frozen.image,window:frozen.window,prompt,files:Object.fromEntries([...paths,"scripts/pnwf/container_bridge.mjs","scripts/pnwf/container_adapter.mjs"].map(p=>[p,digest(readFileSync(join(repo,p)))]))};
const order=[["redraw","auto"],["suppressed","solo"],["redraw","solo"],["suppressed","auto"]];
let mockQualification;
if(paid){
  mockQualification=readJson(resolve(v.qualification));
  assert(mockQualification.mode==="mock" && mockQualification.passed && mockQualification.cases.length===4);
  assert.deepEqual(mockQualification.seal,seal);
}
mkdirSync(root);
const runtime=join(root,"runtime");stageSoftwareRuntime(repo,runtime);
const provider=paid?requireOpenCodeGoProbe(readJson(join(repo,"research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json"))):undefined;
const matrix={seal,mode:v.mode,passed:false,cases:[]};
for(const [variant,arm] of order){
  const label=variant+"-"+arm,solo=arm==="solo",run=join(root,label),stage=join(run,"stages",id);
  mkdirSync(stage,{recursive:true});
  const privateDir=join(run,"desk"),world=join(stage,"world");
  const {basis}=prepare(privateDir,variant,world);
  if(paid)assert.equal(basis,mockQualification.cases.find(c=>c.label===label).basis);
  if(matrix.cases.length)assert.equal(basis,matrix.cases[0].basis);
  const state=join(stage,"state"),profile=join(run,"profile.json");
  mkdirSync(state);
  const project={projectId:"fleet-night-shift",localPeer:"night-principal",goal:prompt};
  profileFor({...project,world,state,path:profile});await initializeProject(profile,basis,project);
  const cohortId=randomUUID(),budget=paid?null:12000000,promptPath=join(run,"prompt.txt");
  writeFileSync(promptPath,prompt);
  writeJson(join(run,"core.json"),{cohortId,budget,sessions:[{id,condition:"P",world,state,expectedHead:basis,killAfterMs:seal.window.wallClockMs,deployment:profile,promptPath}]});
  if(paid)writeJson(join(run,"cohort.json"),{schema:PAID_COHORT_SCHEMA,cohortId,stages:[{id}],...seal.window});
  const budgetPath=join(run,"request-ledger.sqlite");
  const ledger=ExecutionBudget.initialize(budgetPath,{schema:paid?USAGE_ONLY_SCHEMA:"pnwf-request-budget/v1",cohortId,aggregateCeiling:budget,sessions:[{id,ceiling:budget,softCeiling:budget,maxRequests:seal.window.maxRequests}]});
  const result={label,mode:v.mode,seal,basis};let mock;
  try{
    if(!paid)mock=await startMockProvider({reply:nightMock(solo,prompt)});
    const mode=paid?PAID_MODE:"mock";
    ledger.startSession(id);
    result.execution=await runContainerSession({run,sessionId:id,budgetPath,repository:runtime,image:seal.image,mode,provider:mock?.config,experiment:{layout:"product",openCodeGoProfile:provider,configureProfile:home=>installDesk(home,solo),dispatchDesk:deskPort(privateDir,world)}});
    result.isolation=isolated(readJson(join(run,"out",id,"qualification.json")));
    result.evidence=attribute(run,id,mode);
    assert(result.evidence.usageQualified,"Usage reconciliation incomplete");
    if(paid)result.attribution=analyzeAttributedStage(run,id,{context:true,result});
    const traces=result.evidence.traces,principal=traces.find(t=>t.role==="principal");
    const dir=join(run,"runtime-"+id,"sessions");
    const path=readdirSync(dir,{recursive:true}).find(p=>p.includes(principal.id)&&p.endsWith(".jsonl.zstd"));
    const events=readStream(join(dir,path),principal.digest);
    const names=events.find(e=>e.type==="request/header").data.header.tools.map(t=>t.name);
    assert(names.includes("fleet_desk"));
    for(const tool of ["subagent","subagent_fork","workflow"])assert.equal(names.includes(tool),!solo,tool+" condition mismatch");
    result.children=traces.filter(t=>t.role!=="principal").map(t=>t.id);
    if(solo)assert.equal(result.children.length,0);
    result.head=head(world);result.clean=clean(world);
    result.changed=git(world,"diff","--name-only",basis,result.head).split("\n").filter(Boolean);
    result.draft=existsSync(join(privateDir,"checkpoint.json"))?readJson(join(privateDir,"checkpoint.json")).commit:null;
    result.bookings=existsSync(join(privateDir,"rehearsals.jsonl"))?readFileSync(join(privateDir,"rehearsals.jsonl"),"utf8").trim().split("\n").map(JSON.parse):[];
    if(!paid){
      assert(result.execution.natural && result.execution.paidModelCalls===0);
      assert.equal(result.children.length,solo?0:1);
      assert.deepEqual(result.bookings.map(b=>b.booking),["conflict","feasible"]);
      assert.equal(result.bookings.at(-1).commit,result.head);assert(result.clean);
      assert(git(world,"show",result.head+":handover/shift.md").includes(variant==="redraw"?"p17 retry redrawn":"p17 retry suppressed"));
    }
    result.accounted=true;
  }catch(e){result.error=e.message;}
  finally{
    result.accounting=ledger.snapshot();ledger.close();
    if(mock){result.mockFailures=mock.failures;await mock.close();}
    writeJson(join(run,"result.json"),result);
    matrix.cases.push({label,basis,accounted:result.accounted??false,requests:result.accounting.requests.length,natural:result.execution?.natural??false,error:result.error});
    writeJson(join(root,"matrix.json"),matrix);
  }
  console.log(JSON.stringify(matrix.cases.at(-1)));
  if(!result.accounted){process.exitCode=1;break;}
}
matrix.passed=matrix.cases.length===4&&matrix.cases.every(c=>c.accounted);
writeJson(join(root,"matrix.json"),matrix);
