/** One business-only Fleet change, followed by a cold handoff. Each directory is a new cohort. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { launchDeployment, loadDeploymentProfile } from "../../../dist/src/advanced.js";
import { analyzeAttributedStage } from "../analyze_energy_trajectory.mjs";
import { PAID_COHORT_SCHEMA, PAID_MODE } from "../bounded_provider.mjs";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { OPENCODE_GO_MESSAGES, OPENCODE_GO_MODEL, requireOpenCodeGoProbe } from "../opencode_go.mjs";
import { changed, clean, digest, git, head, readJson, sha, writeJson } from "../energy/contract.mjs";
import { makeWorkerBroker } from "../energy/container-worker.mjs";
import { attribute } from "../energy/evidence.mjs";
import { admitBasis, checkpoint, profileFor } from "../energy/product.mjs";
import { basis, candidateAtRest, gitBytes, measure, prompt, release, resumePrompt } from "./autonomy-evidence.mjs";
import { mockFinding, mockReply } from "./autonomy-mock.mjs";
import { CORRECTION_PATH, SCENARIO } from "./contract.mjs";
import { PUBLISHED_PAIR, restoreOriginalBasis } from "./rerun-basis.mjs";
import { bindSoftwareRun, isolated, owner, stageSoftwareRuntime, workerPolicy } from "./run.mjs";

const { values } = parseArgs({options:Object.fromEntries(["action","mode","run","qualification","approve"].map(name=>[name,{type:"string"}]))});
assert(values.run && ["mock","live"].includes(values.mode));
const paid = values.mode === "live";
const root = resolve(values.run);
const repo = fileURLToPath(new URL("../../../",import.meta.url));
const pair = join(repo,PUBLISHED_PAIR);
const archive = join(repo,"research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618");
const historic = readJson(join(archive,"contract.json"));
const probeFile=join(repo,"research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json");
const openCodeGoProfile=requireOpenCodeGoProbe(readJson(probeFile));
const {image,window}=historic;
assert.equal(historic.originalAdmission.approved,basis);
assert.equal(git(repo,"merge-base",release,head(repo)),release);
const {runtime}=bindSoftwareRun(root,image);
const fileDigest=path=>digest(readFileSync(path));
const seal={ release,basis,tree:historic.tree,image,dsh:historic.dsh,model:OPENCODE_GO_MODEL,provider:"opencode-go",route:OPENCODE_GO_MESSAGES,window,
  originalAdmission:historic.originalAdmission,fixture:digest(gitBytes(repo,"show",release+":"+PUBLISHED_PAIR+"/evidence.json")),
  changePrompt:digest(prompt),handoffPrompt:digest(resumePrompt),probe:fileDigest(probeFile),
  files:Object.fromEntries(["scripts/pnwf/software/autonomy.mjs","scripts/pnwf/software/autonomy-evidence.mjs","scripts/pnwf/software/autonomy-mock.mjs","scripts/pnwf/software/probe.cjs","scripts/inspector/dsh-web.mjs","host/dsh/lib/inspector/graph.js","host/dsh/lib/inspector/observe.js","web/src/project_workspace/ProjectWorkspaceView.tsx"].map(p=>[p,fileDigest(join(repo,p))])) };
function paths(base,id) {
  const stage=join(base,"stages",id);
  return {run:base,id,arm:"P",stage,world:join(stage,"world"),state:join(stage,"state"),profile:join(base,"profile.json"),out:join(base,"out",id)};
}
const p=paths(root,"CHANGE");
const approvedDir=join(root,"accepted");
const accepted=paths(approvedDir,"RESUME");
const jsonIn=(name,v)=>writeJson(join(root,name),v);
function loadContract() {assert.deepEqual(readJson(join(root,"contract.json")).seal,seal);}
function qualified() {
  const file=resolve(values.qualification);
  const q=readJson(file);
  assert(q.passed && q.mode==="mock" && q.paidRequests===0 && q.readback?.bothSurfaces && q.freshSession,"Mock qualification missing terminal or UI evidence");
  assert.deepEqual(q.seal,seal,"Mock and real conditions differ");
}
async function withProject(where, fn) {
  const d=launchDeployment(loadDeploymentProfile(where.profile));
  try { return await fn(d.installed); } finally { await d.close(); }
}
function bindProfile(where) { profileFor({...SCENARIO,world:where.world,state:where.state,path:where.profile}); }
async function session(where, text, expected, reply) {
  const {run,id,world,state,out,profile}=where;
  const mode=paid?PAID_MODE:"mock", ceiling=paid?null:12000000;
  const cohortId="fleet-"+id.toLowerCase()+"-"+randomUUID();
  const promptPath=join(run,"prompt.txt");
  writeFileSync(promptPath,text,{flag:"wx"});
  if(paid)writeJson(join(run,"cohort.json"),{schema:PAID_COHORT_SCHEMA,cohortId,stages:[{id}],...window});
  writeJson(join(run,"core.json"),{cohortId,budget:ceiling,sessions:[{id,condition:"P",world,state,expectedHead:expected,killAfterMs:window.wallClockMs,deployment:profile,promptPath}]});
  const budgetPath=join(run,"request-ledger.sqlite");
  const ledger=ExecutionBudget.initialize(budgetPath,{schema:paid?USAGE_ONLY_SCHEMA:"pnwf-request-budget/v1",cohortId,aggregateCeiling:ceiling,
    sessions:[{id,ceiling,softCeiling:ceiling,maxRequests:window.maxRequests}]});
  let mock;
  const result={seal,mode,cohortId};
  try {
    if(!paid)mock=await startMockProvider({reply});
    ledger.startSession(id);
    result.execution=await runContainerSession({run,sessionId:id,budgetPath,repository:runtime,image,mode,provider:mock?.config,
      experiment:{layout:"product",openCodeGoProfile:paid?openCodeGoProfile:undefined,...(id==="CHANGE"?{
        createWorker: options=>makeWorkerBroker({...options,basis,policy:workerPolicy})}: {})}});
    if(existsSync(join(out,"qualification.json")))result.isolation=isolated(readJson(join(out,"qualification.json")));
    try {
      result.evidence=attribute(run,id,mode);
      if(paid && result.evidence.usageQualified)result.responseAttribution=analyzeAttributedStage(run,id,{context:true,result});
    } catch(e) {result.attributionError=e.message;}
  } finally {
    result.accounting=ledger.snapshot();ledger.close();
    if(mock){result.mockFailures=mock.failures;await mock.close();}
    writeJson(join(run,"session.json"),result);
  }
  assert(result.execution.natural && result.evidence?.valid && result.isolation,"Session, isolation or accounting incomplete: "+JSON.stringify({error:result.execution.error,stop:result.execution.killedBy,reason:result.accounting.reason,attribution:result.attributionError,mock:result.mockFailures}));
  if(paid)assert(result.responseAttribution,"response attribution incomplete: "+result.attributionError);
  return result;
}

async function change() {
  if(paid)qualified();
  mkdirSync(root);
  mkdirSync(p.stage,{recursive:true});
  const cases=readJson(join(pair,"evidence.json")).cases.filter(c=>c.arm==="P");
  const input=restoreOriginalBasis({archive:pair,source:join(root,"host-objects"),output:p.world,
    previous:cases.find(c=>c.session==="T2"),first:cases.find(c=>c.session==="T1")});
  assert.equal(input.basis,basis);assert.equal(input.tree,historic.tree);
  mkdirSync(p.state);bindProfile(p);stageSoftwareRuntime(repo,runtime);
  owner(p,"initialize",historic.first);
  const admission=owner(p,"basis",basis,values.mode);
  assert.equal(admission.approved,basis);
  jsonIn("contract.json",{seal,mode:values.mode,implementation:head(repo),input,admission});
  measure(p.world,basis,image,join(root,"baseline-check"));
  let mock;
  if(!paid){
    const objects=join(root,"host-objects");
    git(objects,"fetch",join(archive,"candidate-and-accepted.bundle"),"refs/heads/candidate");
    const patch=gitBytes(objects,"diff","--binary",basis,"FETCH_HEAD");
    mock=mockReply(patch);
  }
  const s=await session(p,prompt,basis,mock);
  const facts=owner(p,"facts");
  assert.equal(facts.head,basis,"the project accepted a change before owner review");
  assert(clean(p.world),"canonical workspace has uncommitted changes");
  const {commit,attemptId}=candidateAtRest(p.world,facts);
  const result=measure(p.world,commit,image,join(root,"candidate-check"));
  const contributions=await withProject(p,async i=>i.application.contribution.list());
  if(!paid){
    assert(s.evidence.traces.some(t=>t.role==="native-child"));
    assert(contributions.some(c=>c.record.finding===mockFinding.finding && c.decisions.some(d=>d.record.decisionNote===mockFinding.note)));
  }
  const candidate={...result,attemptId,basis,route:attemptId?"settled-work":"direct-git",contributions,natural:s.execution.natural,usageQualified:s.evidence.usageQualified};
  jsonIn("candidate.json",candidate);
  writeFileSync(join(root,"candidate.patch"),gitBytes(p.world,"diff",basis,commit));
  console.log("FLEET_CANDIDATE",commit,candidate.route,"contributions",contributions.length);
}
async function accept() {
  loadContract();
  const reviewed=readJson(join(root,"candidate.json"));
  const commit=paid?values.approve:reviewed.commit;
  assert(sha(commit)&&commit===reviewed.commit,"Owner approval must match the reviewed full candidate SHA");
  assert(reviewed.usageQualified && reviewed.natural);
  const original=owner(p,"facts");assert.equal(original.head,basis);
  assert.equal(candidateAtRest(p.world,original).commit,commit);
  assert.equal(git(p.world,"rev-parse",commit+"^{tree}"),reviewed.tree);
  mkdirSync(approvedDir);mkdirSync(accepted.stage,{recursive:true});
  checkpoint(p.state);
  cpSync(p.world,accepted.world,{recursive:true});cpSync(p.state,accepted.state,{recursive:true});bindProfile(accepted);
  let acceptance,source;
  if(reviewed.attemptId){
    acceptance=owner(accepted,"promote",reviewed.attemptId,basis,commit);source="WORK_PROMOTION";
  } else {
    git(accepted.world,"checkout","-q","--detach",commit);
    acceptance=await admitBasis({...SCENARIO,world:accepted.world,state:accepted.state,approved:commit,mode:values.mode,reason:"Owner accepted the tested Fleet release revision "+commit});
    source="DIRECT_BASIS";
  }
  const acceptedHead=head(accepted.world);
  assert.equal(owner(accepted,"facts").head,acceptedHead);
  assert.equal(git(accepted.world,"rev-parse",acceptedHead+"^{tree}"),reviewed.tree);
  const contributions=reviewed.contributions;
  const recorded=contributions.flatMap(c=>c.decisions.map(d=>({contribution:c.record.contributionId,finding:c.record.finding,decision:d.record.decision,
    decisionId:d.record.decisionId,note:d.record.decisionNote})));
  const title="Fleet rollout verification";
  const body=["Fleet source "+CORRECTION_PATH+" (blob "+reviewed.correctionBlob+").",
    "Observed by the independent release verifier: before the change, explicit zero and omitted limits returned zero frames. In the accepted tree both returned three, in source order.",
    "Reviewed candidate "+commit+". Accepted project version "+acceptedHead+".",
    ...recorded.map(d=>"Project contribution "+d.contribution+" / "+d.decisionId+" / "+d.decision+": "+d.note),
    ...(recorded.length?[]:["The project journal contains no contributor decision for this run."])].join("\n");
  const note=await withProject(accepted,i=>i.application.projectWorkspace.recordJournalEntry({projectId:SCENARIO.projectId,kind:"REFERENCE_NOTE",title,body,
    provenance:"Fleet release verifier / "+source,relatedRefs:[{kind:"git_commit",id:acceptedHead}]}));
  checkpoint(accepted.state);
  jsonIn("acceptance.json",{basis,candidate:commit,acceptedHead,source,acceptance,tree:reviewed.tree,note:{id:note.entryId,title,body},recorded});
  console.log("FLEET_ACCEPTED",acceptedHead,source);
}
async function resume() {
  loadContract();if(paid)qualified();
  const a=readJson(join(root,"acceptance.json"));
  assert.equal(head(accepted.world),a.acceptedHead);
  const before=owner(accepted,"facts");
  let turn=0;
  const reply=async(req,ordinal)=>{
    const out=req.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(b=>b.type==="tool_result").at(-1);
    if(turn===1)assert(JSON.stringify(out).includes(a.acceptedHead));
    if(turn===2){assert(JSON.stringify(out).includes(a.note.id));return [{type:"text",text:a.acceptedHead+" "+a.note.id+" "+CORRECTION_PATH}];}
    return [{type:"tool_use",id:"resume_"+ordinal,name:"palimpsest_project",input:{action:turn++===0?"overview":"journal_entries"}}];
  };
  const s=await session(accepted,resumePrompt,a.acceptedHead,reply);
  const after=owner(accepted,"facts");
  assert.equal(after.head,a.acceptedHead);assert.equal(head(accepted.world),a.acceptedHead);assert(clean(accepted.world));assert.deepEqual(before.events,after.events);
  const previous=readJson(join(root,"session.json"));
  assert.notEqual(s.evidence.principalId,previous.evidence.principalId);
  const log=readFileSync(join(accepted.out,"run.log"),"utf8");
  const audit={acceptedHead:a.acceptedHead,fresh:true,sessionId:s.evidence.principalId,previousId:previous.evidence.principalId,
    returnedHead:log.includes(a.acceptedHead),returnedNote:log.includes(a.note.id),returnedSource:log.includes(CORRECTION_PATH),
    stableGit:true,stableWork:true,natural:s.execution.natural};
  jsonIn("resume.json",audit);
  console.log("FLEET_RESUME",JSON.stringify(audit));
}
async function qualify() {
  loadContract();assert(!paid);
  const a=readJson(join(root,"acceptance.json")),s=readJson(join(root,"session.json")),rs=readJson(join(approvedDir,"session.json"));
  const r=readJson(join(root,"resume.json")),ui=readJson(join(root,"ui.json"));
  assert(r.fresh&&r.returnedHead&&r.returnedNote&&r.stableWork&&ui.bothSurfaces&&ui.head===a.acceptedHead&&ui.noteId===a.note.id);
  assert(s.execution.paidModelCalls===0&&rs.execution.paidModelCalls===0&&s.evidence.valid&&rs.evidence.valid);
  jsonIn("qualification.json",{mode:"mock",passed:true,seal,paidRequests:0,requests:s.evidence.requests+rs.evidence.requests,
    freshSession:r.sessionId,readback:ui,candidate:a.candidate,accepted:a.acceptedHead,decision:a.recorded});
}
switch(values.action){
 case "change":await change();break;case "accept":await accept();break;case "resume":await resume();break;case "qualify":await qualify();break;
 default:throw Error("Use --action=change|accept|resume|qualify --mode=mock|live --run=<directory>");
}
