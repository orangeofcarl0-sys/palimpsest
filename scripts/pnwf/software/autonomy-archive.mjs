/** Archive only project evidence. The DSH home, provider configuration and browser capabilities stay on the host. */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { analyzeAttributedStage, readStream } from "../analyze_energy_trajectory.mjs";
import { digest, git, readJson, writeJson } from "../energy/contract.mjs";
import { profileFor } from "../energy/product.mjs";
import { SCENARIO } from "./contract.mjs";

const { values } = parseArgs({ options: { run: {type:"string"}, out: {type:"string"}, verify: {type:"string"}, restore: {type:"string"} } });
const sessions = [["", "CHANGE"], ["accepted", "RESUME"]];
const filesUnder = dir => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)).sort();
const localName = (dir,path) => relative(dir,path).split(sep).join("/");

function copy(from,to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from,to);
}

function createBundle(run,out,candidate,accepted) {
  const tmp = mkdtempSync(join(tmpdir(),"fleet-evidence-"));
  try {
    git(tmp,"init","-q","--bare");
    for (const [label,commit,world] of [
      ["basis",candidate.basis,join(run,"stages/CHANGE/world")],
      ["candidate",candidate.commit,join(run,"stages/CHANGE/world")],
      ...(accepted ? [["accepted",accepted.acceptedHead,join(run,"accepted/stages/RESUME/world")]] : []),
    ]) {
      git(tmp,"fetch","--quiet","--no-tags",world,commit);
      assert.equal(git(tmp,"rev-parse","FETCH_HEAD"),commit);
      git(tmp,"update-ref","refs/heads/"+label,commit);
    }
    const bundle=join(out,"fleet.bundle");
    git(tmp,"bundle","create",bundle,"--branches");
    git(tmp,"bundle","verify",bundle);
  } finally { rmSync(tmp,{recursive:true,force:true}); }
}

function copySession(from,to,stage) {
  for (const file of ["session.json","prompt.txt"]) copy(join(from,file),join(to,file));
  const dir=join("out",stage);
  for (const file of ["request-accounting.json","request-observations.jsonl","run.json","run.log","run.err","worker-receipts.json","qualification.json"]) {
    if (existsSync(join(from,dir,file))) copy(join(from,dir,file),join(to,dir,file));
  }
  const traces=join(from,dir,"attribution");
  if (existsSync(traces)) {
    for (const file of filesUnder(traces)) if (file.endsWith(".timeline.json")) copy(file,join(to,dir,"attribution",basename(file)));
  }
  const report=readJson(join(from,"session.json"));
  const roots=[join("runtime-"+stage,"sessions"),...(report.evidence?.workerReceipts??[])
    .filter(w=>w.attemptId).map(w=>join(dir,"worker-"+w.attemptId,"home","sessions"))];
  for (const path of roots) {
    if (!existsSync(join(from,path))) continue;
    for (const file of filesUnder(join(from,path))) {
      if (file.endsWith(".jsonl.zstd")) copy(file,join(to,relative(from,file)));
    }
  }
}

function observe(out) {
  const facts={};
  const version=existsSync(join(out,"acceptance.json")) ? readJson(join(out,"acceptance.json")) : null;
  for (const [part,stage] of sessions) {
    const base=join(out,part);
    if (!existsSync(join(base,"session.json"))) continue;
    const session=readJson(join(base,"session.json"));
    const dir=join(base,"out",stage);
    const turns=readFileSync(join(dir,"run.log"),"utf8").split(/\r?\n/u)
      .filter(line=>line.startsWith("PALIMPSEST_TURN ")).map(line=>JSON.parse(line.slice("PALIMPSEST_TURN ".length)));
    const finalText=turns.at(-1)?.text ?? "";
    const traces=[];
    const timelines=join(dir,"attribution");
    if (existsSync(timelines)) for (const file of filesUnder(timelines)) {
      const timeline=readJson(file).summary;
      const role=session.evidence?.traces.find(t=>t.id===timeline.session.id)?.role;
      const results=new Map(timeline.results.map(r=>[r.callId,r]));
      traces.push({role,session:timeline.session.id,counts:timeline.counts,calls:timeline.calls.map(call=>{
        const result=results.get(call.callId);
        return {callId:call.callId,callSeq:call.seq,resultSeq:result?.seq??null,operation:call.kind,
          ...(call.args?.intent?{intent:call.args.intent}:{}),refusal:result?.refusal??null};
      })});
    }
    const usage=session.evidence;
    facts[stage]={sessionId:usage?.principalId,natural:session.execution.natural,paidRequests:session.execution.paidModelCalls,
      requests:usage?.requests,knownTokens:session.accounting.confirmed,unresolved:session.accounting.unresolvedRequests,
      usageByRole:usage?.usageByRole,elapsedMs:usage?.elapsedMs,traces,finalText};
    if (stage==="RESUME" && version) facts[stage].finalAnswerContains={
      acceptedHead:finalText.includes(version.acceptedHead),versionNote:finalText.includes(version.note.id),
      correction:finalText.includes("updates/2026-11-10/fleet-default-limit.md"),
      decisionIds:version.recorded.filter(d=>finalText.includes(d.decisionId)).map(d=>d.decisionId),
    };
  }
  return facts;
}

function verify(out) {
  const manifest=readJson(join(out,"manifest.json"));
  for (const [file,expected] of Object.entries(manifest)) {
    const data=readFileSync(join(out,file));
    assert.equal(digest(data),expected,file);
    if (file.endsWith(".png") || file.endsWith(".bundle")) continue;
    const text=file.endsWith(".zstd") ? JSON.stringify(readStream(join(out,file),expected)) : data.toString("utf8");
    assert(!/(?:oc_sk_[\w.-]{32,}|(?:sk-proj-|ghp_|github_pat_)[\w-]{32,}|[?&](?:token|capability)=[A-Za-z0-9._-]{24,})/u.test(text),
      "Unexpected credential-shaped value in "+file);
  }
  for (const [part,stage] of sessions) {
    const base=join(out,part);
    if (!existsSync(join(base,"session.json"))) continue;
    const result=readJson(join(base,"session.json"));
    if (result.responseAttribution) {
      const replay=analyzeAttributedStage(base,stage,{context:true,result});
      assert.deepEqual(replay,result.responseAttribution,stage+" request bindings");
    }
    for (const trace of result.evidence?.traces??[]) {
      const stream=Object.keys(manifest).find(path=>path.includes("/"+trace.id+"/") && path.endsWith(".zstd"));
      assert(stream && manifest[stream]===trace.digest,"Missing original "+trace.id);
    }
  }
  if (existsSync(join(out,"observations.json"))) assert.deepEqual(observe(out),readJson(join(out,"observations.json")));
  return Object.keys(manifest).length;
}

// The current head is owned by Work. Contribution findings, decisions and version references
// are records in the project journal. SQLite makes a consistent backup including committed WAL.
const ownerFiles = ["palimpsest.sqlite","journal.sqlite"];
function saveOwners(state,out) {
  mkdirSync(out);
  for (const file of ownerFiles) {
    const db=new DatabaseSync(join(state,file),{readOnly:true});
    try { db.prepare("VACUUM INTO ?").run(join(out,file)); }
    finally { db.close(); }
  }
}

function restore(out,destination) {
  const accepted=existsSync(join(out,"acceptance.json"));
  const revision=accepted ? readJson(join(out,"acceptance.json")).acceptedHead : readJson(join(out,"candidate.json")).commit;
  mkdirSync(destination);
  const world=join(destination,"world");
  mkdirSync(world);
  git(world,"init","--quiet");
  git(world,"fetch","--quiet",join(out,"fleet.bundle"),"refs/heads/"+(accepted?"accepted":"candidate"));
  assert.equal(git(world,"rev-parse","FETCH_HEAD"),revision);
  git(world,"checkout","--quiet","--detach",revision);
  const state=join(destination,"state");
  for (const file of ownerFiles) copy(join(out,accepted?"owners":"revision-owners",file),join(state,file));
  const profile=join(destination,"profile.json");
  profileFor({...SCENARIO,world,state,path:profile});
  return profile;
}

function archive(run,out) {
  mkdirSync(out);
  const rootFiles=["contract.json","qualification.json","candidate.json","candidate.patch","acceptance.json","resume.json","ui.json","ui-restart.json"];
  for (const file of rootFiles) if (existsSync(join(run,file))) copy(join(run,file),join(out,file));
  for (const dir of ["baseline-check","candidate-check"]) {
    for (const file of ["behavior.json","public-tests.log"]) {
      if (existsSync(join(run,dir,file))) copy(join(run,dir,file),join(out,dir,file));
    }
  }
  for (const name of ["sidebar.png","workspace.png"]) {
    if (existsSync(join(run,"screens",name))) copy(join(run,"screens",name),join(out,"screens",name));
  }
  for (const [part,stage] of sessions) {
    if (existsSync(join(run,part,"session.json"))) copySession(join(run,part),join(out,part),stage);
  }
  const candidate=join(run,"candidate.json");
  if (existsSync(candidate)) createBundle(run,out,readJson(candidate),existsSync(join(run,"acceptance.json"))?readJson(join(run,"acceptance.json")):null);
  if (existsSync(candidate)) saveOwners(join(run,"stages/CHANGE/state"),join(out,"revision-owners"));
  if (existsSync(join(run,"acceptance.json"))) saveOwners(join(run,"accepted/stages/RESUME/state"),join(out,"owners"));
  writeJson(join(out,"observations.json"),observe(out));
  const entries=filesUnder(out).map(file=>[localName(out,file),digest(readFileSync(file))]);
  writeJson(join(out,"manifest.json"),Object.fromEntries(entries));
  return verify(out);
}
if (values.verify) {
  console.log("Verified",verify(resolve(values.verify)),"evidence files");
  if (values.restore) console.log("Restored project",restore(resolve(values.verify),resolve(values.restore)));
}
else {
  assert(values.run && values.out,"Use --run=<cohort> --out=<new directory> or --verify=<archive>");
  console.log("Archived and verified",archive(resolve(values.run),resolve(values.out)),"files");
}
