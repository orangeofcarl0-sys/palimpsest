import assert from "node:assert/strict";
import {copyFileSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {DatabaseSync} from "node:sqlite";
import {execFileSync} from "node:child_process";
import {PAID_MODE} from "../bounded_provider.mjs";
import {digest,readJson,writeJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {git} from "../transit-desk/run.mjs";
import * as reliefCase from "./case.mjs";
import * as shiftLogCase from "../depot-shift-log/case.mjs";
import {oldRequest} from "./isolate-unknown.mjs";
import {buildEvidence,evidencePaths} from "./evidence.mjs";

function copy(src,dest,p){
  assert(lstatSync(join(src,p)).isFile());
  mkdirSync(dirname(join(dest,p)),{recursive:true});copyFileSync(join(src,p),join(dest,p));
}
function saveReviewerCopies(src,out){
  const dir=join(src,"desk");
  for(const entry of readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^\d+$/.test(d.name))){
    const world=join(dir,entry.name,"stage/world");
    if(!existsSync(join(world,".git")))continue;
    const base=readJson(join(dir,"journal.json")).find(e=>e.kind==="CONTACT"&&e.n===Number(entry.name)).sha;
    const head=git(world,"rev-parse","HEAD").trim();
    const status=git(world,"status","--porcelain","--untracked-files=all");
    if(head===base&&!status)continue;
    const dest=join(out,"desk",entry.name,"private");
    mkdirSync(dest,{recursive:true});
    git(world,"bundle","create",join(dest,"world.bundle"),"HEAD","--branches");
    writeJson(join(dest,"snapshot.json"),{base,head,status});
    const patch=git(world,"diff","--binary","HEAD");
    if(patch)writeFileSync(join(dest,"worktree.patch"),patch);
    for(const p of git(world,"ls-files","--others","--exclude-standard","-z").split("\0").filter(Boolean))copy(world,join(dest,"untracked"),p);
  }
}
function manifest(dir){
  const sums={};
  for(const d of readdirSync(dir,{withFileTypes:true,recursive:true}).filter(d=>d.isFile())){
    const path=join(d.parentPath,d.name),p=path.slice(dir.length+1).replaceAll("\\","/");
    if(p==="manifest.json")continue;
    const bytes=readFileSync(path),hash=digest(bytes);
    const text=p.endsWith(".zstd")?JSON.stringify(readStream(path,hash)):bytes.toString();
    assert(!/(?:oc_sk_|sk-proj-|github_pat_|ghp_)[\w.-]{32,}/u.test(text),"Unexpected credential-shaped value: "+p);
    sums[p]=hash;
  }
  return sums;
}
async function verify(dir){
  const m=readJson(join(dir,"matrix.json"));
  const splitLogs=m.seal.scenario==="depot-shift-log";
  const {grade,measure,here,goal}=splitLogs?shiftLogCase:reliefCase;
  assert.deepEqual(readJson(join(dir,"previous-unknown.json")),oldRequest());
  assert.deepEqual(manifest(dir),readJson(join(dir,"manifest.json")));
  for(const [p,hash] of Object.entries(m.seal.files)){
    const current=digest(readFileSync(join(here,p)));
    const snapshot=join(dir,"frozen-sources",p);
    if(m.seal.materials&&!p.includes("/")&&existsSync(snapshot)){
      const deployed=readFileSync(snapshot);
      assert.equal(digest(deployed),hash,p);
      assert.equal(deployed.toString().replaceAll("\r\n","\n"),readFileSync(join(here,p),"utf8").replaceAll("\r\n","\n"),p);
    }else if(splitLogs&&!m.seal.reviewExit&&["desk.mjs","mock.mjs","run.mjs"].includes(p)&&current!==hash){
      const revision=m.seal.materials?"a4d88df671f4de20feb83a9a44191be86b27bec5":m.seal.delivery?"91dc8787e4500250aefaecf3a809f219bd5e2298":"d70eebc054fcf9f96154cff53d976ce13cd43725";
      const frozen=execFileSync("git",["show",revision+":scripts/pnwf/depot-shift-log/"+p],{cwd:here});
      assert.equal(digest(frozen),hash,p);
    }else assert.equal(current,hash,p);
  }
  for(const row of m.arms){
    const src=join(dir,row.arm);
    assert.equal(readFileSync(join(src,"prompt.txt"),"utf8"),goal);
    const t=buildEvidence(src,m.mode==="mock"?"mock":PAID_MODE);
    assert.deepEqual(JSON.parse(JSON.stringify(t)),readJson(join(src,"trajectory.json")));
    if(m.seal.reviewExit){
      const {reviewPhases}=await import("../depot-shift-log/review-phases.mjs");
      assert.deepEqual(reviewPhases(src),row.reviewPhases);
    }
    if(m.mode==="live"){
      // SQLite can create WAL sidecars on read. Verify a copy and keep the archive byte-stable.
      const scratch=mkdtempSync(join(tmpdir(),"depot-ledger-"));
      const path=join(scratch,"ledger.sqlite");
      copyFileSync(join(src,"request-ledger.sqlite"),path);
      const database=new DatabaseSync(path,{readOnly:true});
      try{
        const archived=readJson(join(src,"out/REVIEW/request-accounting.json")).requests;
        const rows=database.prepare("SELECT id,state,actual FROM requests ORDER BY rowid").all();
        assert.deepEqual(rows.map(r=>({...r})),archived.map(({id,state,actual})=>({id,state,actual})));
      }finally{database.close();rmSync(scratch,{recursive:true,force:true});}
    }
    const db=mkdtempSync(join(tmpdir(),"depot-regrade-"));
    try{
      git(db,"init","-q");git(db,"fetch","-q",join(src,"world.bundle"),"HEAD","+refs/heads/*:refs/heads/*");
      assert.deepEqual(measure(db,row.basis),readJson(join(src,"previous-shift-slip.json")));
      assert.deepEqual(grade(db,row.basis,row.head),row.grade);
      if(m.seal.materials){
        const {obligations,inspectDelivery}=await import("../depot-shift-log/materials.mjs");
        assert.deepEqual(m.seal.materials,obligations);
        git(db,"checkout","-q","--detach",row.head);
        if(!row.status)assert.deepEqual(inspectDelivery(db,row.head,join(src,"desk/receipts.sqlite")),row.materials);
      }
      const facts=readJson(join(src,"desk/journal.json"));
      if(m.seal.delivery){
        // An amended candidate may only be reachable from its reviewer's pinned bundle.
        for(const e of facts.filter(e=>e.kind==="START_REVIEW")){
          git(db,"fetch","-q",join(src,"desk",String(e.n),"pinned.bundle"),"HEAD");
          assert.equal(git(db,"rev-parse","FETCH_HEAD").trim(),e.sha);
        }
        const dbFile=new DatabaseSync(join(src,"desk/receipts.sqlite"),{readOnly:true});
        try{
          const saved=dbFile.prepare("SELECT sha,source,receipt FROM receipts ORDER BY sha").all();
          const measured=facts.filter(e=>e.kind==="PEER_TRIAL").map(e=>e.receipt);
          assert.deepEqual(saved.map(r=>r.sha),[...new Set(measured.map(r=>r.sha))].sort());
          for(const r of saved){
            assert.equal(r.source,m.seal.privateDigest);
            assert.deepEqual(JSON.parse(r.receipt),measure(db,r.sha));
          }
        }finally{dbFile.close();}
      }
      if(splitLogs){
        assert.deepEqual(readJson(join(src,"private-capture.json")),shiftLogCase.privateLog);
        assert.deepEqual(JSON.parse(git(db,"show",row.basis+":operations/cold-cycle.json")),shiftLogCase.publicLog);
        assert.deepEqual(measure(db,row.basis,shiftLogCase.publicLog),row.publicTrial);
        assert.equal(digest(JSON.stringify(shiftLogCase.privateLog)),m.seal.privateDigest);
      }
      for(const f of facts.filter(f=>f.receipt)){
        const record=splitLogs&&f.kind==="SELF_TRIAL"?shiftLogCase.publicLog:undefined;
        assert.deepEqual(measure(db,f.receipt.sha,record),f.receipt);
      }
      for(const f of facts.filter(f=>f.kind==="CONTACT")){
        const priv=join(src,"desk",String(f.n),"private");
        if(!existsSync(priv))continue;
        const snapshot=readJson(join(priv,"snapshot.json"));
        assert.equal(snapshot.base,f.sha);
        git(db,"fetch","-q",join(priv,"world.bundle"),"HEAD");
        assert.equal(git(db,"rev-parse","FETCH_HEAD").trim(),snapshot.head);
        git(db,"merge-base","--is-ancestor",snapshot.base,snapshot.head);
      }
      for(const p of ["HANDOVER.md","shift-plan.json",...(m.seal.materials?["operations/duty-2340.json"]:[])])if(existsSync(join(src,"submitted",p))){
        assert.equal(readFileSync(join(src,"submitted",p),"utf8"),git(db,"show",row.head+":"+p));
      }
    }finally{rmSync(db,{recursive:true,force:true});}
    console.log("Verified",m.mode,row.arm,row.requests,row.unknown,row.grade.passed);
  }
}
const [source,target]=process.argv.slice(2),dest=resolve(target);
if(source!=="--verify"){
  const run=resolve(source);mkdirSync(dest);
  for(const p of ["matrix.json","previous-unknown.json"])copy(run,dest,p);
  const {seal}=readJson(join(run,"matrix.json"));
  if(seal.materials){
    // Keep the actual deployment bytes when a source's line endings differ from Git's LF checkout.
    for(const [p,hash] of Object.entries(seal.files).filter(([name])=>!name.includes("/"))){
      const raw=readFileSync(join(shiftLogCase.here,p));
      if(raw.includes("\r\n")&&digest(raw)===hash)copy(shiftLogCase.here,join(dest,"frozen-sources"),p);
    }
  }
  for(const row of readJson(join(run,"matrix.json")).arms){
    const src=join(run,row.arm),out=join(dest,row.arm),world=join(src,"stages/REVIEW/world");
    for(const p of [...evidencePaths(src),"trajectory.json"])copy(src,out,p);
    if(existsSync(join(src,"private-capture.json")))copy(src,out,"private-capture.json");
    if(existsSync(join(src,"desk/receipts.sqlite")))copy(src,out,"desk/receipts.sqlite");
    saveReviewerCopies(src,out);
    if(row.unknown||readJson(join(run,"matrix.json")).mode==="live")copy(src,out,"request-ledger.sqlite");
    for(const p of ["HANDOVER.md","shift-plan.json",...(row.materials?["operations/duty-2340.json"]:[])]){
      if(row.head!==row.basis&&git(world,"ls-tree",row.head,"--",p).startsWith("100")){
        mkdirSync(dirname(join(out,"submitted",p)),{recursive:true});writeFileSync(join(out,"submitted",p),git(world,"show",row.head+":"+p));
      }
      if(row.status&&existsSync(join(world,p)))copy(world,join(out,"working-copy"),p);
    }
  }
  writeJson(join(dest,"manifest.json"),manifest(dest));
}
await verify(dest);
