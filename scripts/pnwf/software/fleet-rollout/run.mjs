import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {launchDeployment,loadDeploymentProfile} from "../../../../dist/src/advanced.js";
import {PAID_COHORT_SCHEMA,PAID_MODE} from "../../bounded_provider.mjs";
import {ExecutionBudget,USAGE_ONLY_SCHEMA} from "../../execution_budget.mjs";
import {runContainerSession} from "../../container_adapter.mjs";
import {startMockProvider} from "../../mock_provider.mjs";
import {analyzeAttributedStage} from "../../analyze_energy_trajectory.mjs";
import {OPENCODE_GO_MESSAGES,requireOpenCodeGoProbe} from "../../opencode_go.mjs";
import {attribute} from "../../energy/evidence.mjs";
import {configureGit,digest,git,head,clean,readJson,writeJson} from "../../energy/contract.mjs";
import {initializeProject,profileFor} from "../../energy/product.mjs";
import {bindSoftwareRun,stageSoftwareRuntime,isolated} from "../run.mjs";
import {assess,inputs} from "./score.mjs";
import {mockProvider} from "./mock.mjs";

const {values}=parseArgs({options:{run:{type:"string"},mode:{type:"string"},qualification:{type:"string"}}});
assert(values.run && ["mock","live"].includes(values.mode));
const paid=values.mode==="live", run=resolve(values.run), id="ROLLOUT";
const repo=fileURLToPath(new URL("../../../../",import.meta.url));
const fixture=join(repo,"fixtures/psvr/fleet-rollout");
const previous=join(repo,"research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live");
const frozen=readJson(join(previous,"contract.json")).seal;
const prompt="Prepare the Fleet rollout for both windows using fleet/BRIEF.md and the operations records. Deliver a tested, committed release plan and review for the owner.";
const seal={provider:"opencode-go",route:OPENCODE_GO_MESSAGES,model:frozen.model,image:frozen.image,window:frozen.window,
  accepted:readJson(join(previous,"acceptance.json")).acceptedHead,prompt,
  files:Object.fromEntries([...inputs.map(p=>"fixtures/psvr/fleet-rollout/"+p),...["run.mjs","score.mjs","mock.mjs"].map(p=>"scripts/pnwf/software/fleet-rollout/"+p)].map(p=>[p,digest(readFileSync(join(repo,p)))]))};
if(paid){
  const q=readJson(resolve(values.qualification));
  assert(q.mode==="mock" && q.qualified && q.paidModelCalls===0);
  assert.deepEqual(q.seal,seal);
}
mkdirSync(run);
const stage=join(run,"stages",id),world=join(stage,"world"),state=join(stage,"state"),profile=join(run,"profile.json");
mkdirSync(world,{recursive:true});mkdirSync(state);
git(world,"init","-q");configureGit(world,{name:"Fleet trial",email:"fleet@example.invalid"});
git(world,"fetch","-q",join(previous,"fleet.bundle"),"refs/heads/accepted");
git(world,"checkout","-q","-b","fleet","FETCH_HEAD");assert.equal(head(world),seal.accepted);
cpSync(fixture,join(world,"fleet"),{recursive:true});
git(world,"add","fleet");
process.env.GIT_COMMITTER_DATE="2026-11-19T00:00:00Z";
git(world,"commit","-q","--date=2026-11-19T00:00:00Z","-m","Open two Fleet release windows");
delete process.env.GIT_COMMITTER_DATE;
const basis=head(world);
if(paid)assert.equal(basis,readJson(resolve(values.qualification)).basis);
const project={projectId:"fleet-rollout",localPeer:"fleet-principal",goal:prompt,allowedCommands:[{executable:"node",argv_prefix:["--test"]}],standard:"Deliver the two-window allocation and its evidence."};
profileFor({...project,world,state,path:profile});await initializeProject(profile,basis,project);
const {runtime}=bindSoftwareRun(run,seal.image);stageSoftwareRuntime(repo,runtime);
const cohortId="fleet-rollout-"+randomUUID(),budget=paid?null:12000000,promptPath=join(run,"prompt.txt");
writeFileSync(promptPath,prompt);writeJson(join(run,"contract.json"),{seal,basis});
writeJson(join(run,"core.json"),{cohortId,budget,sessions:[{id,condition:"P",world,state,expectedHead:basis,killAfterMs:seal.window.wallClockMs,deployment:profile,promptPath}]});
if(paid)writeJson(join(run,"cohort.json"),{schema:PAID_COHORT_SCHEMA,cohortId,stages:[{id}],...seal.window});
const budgetPath=join(run,"request-ledger.sqlite");
const ledger=ExecutionBudget.initialize(budgetPath,{schema:paid?USAGE_ONLY_SCHEMA:"pnwf-request-budget/v1",cohortId,aggregateCeiling:budget,sessions:[{id,ceiling:budget,softCeiling:budget,maxRequests:seal.window.maxRequests}]});
const result={seal,basis,mode:values.mode,qualified:false};
let mock;
try {
  if(!paid)mock=await startMockProvider({reply:mockProvider(prompt)});
  const provider=paid?requireOpenCodeGoProbe(readJson(join(repo,"research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json"))):undefined;
  const mode=paid?PAID_MODE:"mock";
  ledger.startSession(id);
  result.execution=await runContainerSession({run,sessionId:id,budgetPath,repository:runtime,image:seal.image,mode,provider:mock?.config,experiment:{layout:"product",openCodeGoProfile:provider}});
  result.paidModelCalls=result.execution.paidModelCalls;
  result.isolation=isolated(readJson(join(run,"out",id,"qualification.json")));
  result.evidence=attribute(run,id,mode);
  assert(result.evidence.valid);
  if(paid)result.attribution=analyzeAttributedStage(run,id,{context:true,result});
  const projectHost=launchDeployment(loadDeploymentProfile(profile));
  try {result.contributions=await projectHost.installed.application.contribution.list();}
  finally {await projectHost.close();}
  result.candidate=head(world);
  result.clean=clean(world);
  result.childSessions=result.evidence.traces.filter(t=>t.role==="native-child").map(t=>t.id);
  result.business=assess(world,basis,result.candidate,fixture);
  assert(result.clean);
  if(!paid){assert.equal(result.childSessions.length,3);assert.equal(result.contributions.filter(c=>c.decisions.some(d=>d.record.decision==="ACCEPT_AS_CANDIDATE")).length,3);}
  result.qualified=true;
} catch(error) {result.error=error.message;process.exitCode=1;}
finally {
  result.accounting=ledger.snapshot();ledger.close();
  if(mock){result.mockFailures=mock.failures;await mock.close();}
  writeJson(join(run,"result.json"),result);
  console.log(JSON.stringify({qualified:result.qualified,mode:result.mode,requests:result.evidence?.requests,childSessions:result.childSessions?.length,error:result.error}));
}
