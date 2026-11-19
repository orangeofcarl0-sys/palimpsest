import assert from "node:assert/strict";
import {copyFileSync,cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,relative,resolve} from "node:path";
import {digest,git,configureGit,readJson,writeJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {submission,here} from "./case.mjs";
import {analyze} from "./evidence.mjs";
import {PAID_MODE} from "../bounded_provider.mjs";
import {measure} from "../software/night-isolated/broker.mjs";
import {verifyPartial} from "./partial.mjs";

const files=d=>readdirSync(d,{recursive:true,withFileTypes:true}).filter(x=>x.isFile()).map(x=>join(x.parentPath,x.name));
const rel=(root,file)=>relative(root,file).replaceAll("\\","/");
function copy(source,dest){mkdirSync(dirname(dest),{recursive:true});copyFileSync(source,dest);}
function copyRun(source,dest,forReplay=false){
  for(const file of ["prompt.txt","cohort.json","result.json","trajectory.json","submission.bundle","baseline.bundle","baseline.json"]){
    if(existsSync(join(source,file)))copy(join(source,file),join(dest,file));
  }
  for(const sub of ["out/REVIEW","runtime-REVIEW/sessions","raw-sessions"]){
    if(!existsSync(join(source,sub)))continue;
    for(const p of files(join(source,sub))){
      const path=rel(source,p);
      if(sub==="out/REVIEW"){
        if(/\/worker-[^/]+\/(home|stage)\//.test(path)&&!path.endsWith(".jsonl.zstd"))continue;
        if(path.includes("/attribution/")&&(forReplay||!path.endsWith(".timeline.json")))continue;
      }else if(!path.endsWith(".jsonl.zstd"))continue;
      copy(p,join(dest,path));
    }
  }
}
function manifest(root){
  return Object.fromEntries(files(root).filter(p=>p!==join(root,"manifest.json")).map(p=>{
    const bytes=readFileSync(p),h=digest(bytes);
    const decoded=p.endsWith(".zstd")?JSON.stringify(readStream(p,h)):bytes.toString();
    assert(!/(?:oc_sk_|sk-proj-|github_pat_|ghp_)[\w.-]{32,}/u.test(decoded),"credential-shaped value: "+rel(root,p));
    return [rel(root,p),h];
  }));
}
function archive(source,dest){
  const matrix=readJson(join(source,"matrix.json"));mkdirSync(dest,{recursive:true});assert(!existsSync(join(dest,"manifest.json")));
  copy(join(source,"matrix.json"),join(dest,"matrix.json"));
  for(const c of matrix.cases){const d=c.domain+"-"+c.arm;copyRun(join(source,d),join(dest,d));}
  writeJson(join(dest,"manifest.json"),manifest(dest));
}
function verify(root){
  const matrix=readJson(join(root,"matrix.json"));
  if(matrix.partial)return verifyPartial(root);
  assert.deepEqual(manifest(root),readJson(join(root,"manifest.json")));
  for(const [p,h] of Object.entries(matrix.seal.files))assert.equal(digest(readFileSync(join(here,p))),h,p);
  for(const c of matrix.cases){
    const name=c.domain+"-"+c.arm,s=join(root,name),t=mkdtempSync(join(tmpdir(),"pilot-verify-"));
    try{
      copyRun(s,t,true);
      if(!c.accounted)continue;
      const a=analyze(t,matrix.mode==="live"?PAID_MODE:"mock");assert.deepEqual(JSON.parse(JSON.stringify(a)),readJson(join(s,"trajectory.json")));
      if(c.domain==="software"){
        const out=join(s,"out/REVIEW"),desk=readJson(join(out,"review-desk.json"));
        const catalog=readJson(join(out,"records/contract.json")).captures;
        for(const key of ["P","S"])assert.equal(digest(readFileSync(join(out,"records",key+".tsv"))),catalog[key].sha256);
        for(const [i,inquiry] of desk.entries()){
          if(!inquiry.measurements.length)continue;
          const snap=join(t,"review-"+i);mkdirSync(snap);git(snap,"init","-q");configureGit(snap);
          git(snap,"fetch","-q",join(out,inquiry.bundle),"HEAD");git(snap,"checkout","-q","--detach","FETCH_HEAD");
          assert.equal(git(snap,"rev-parse","HEAD"),inquiry.sha);
          for(const fact of inquiry.measurements)assert.deepEqual(measure(snap,join(out,"records"),matrix.seal.image,inquiry.sha,fact.capture),fact);
        }
      }
      const r=readJson(join(s,"result.json"));
      const sandbox=join(t,"project");mkdirSync(sandbox);git(sandbox,"init","-q");configureGit(sandbox);git(sandbox,"fetch","-q",join(s,"submission.bundle"),"HEAD");git(sandbox,"checkout","-qb","verified","FETCH_HEAD");
      assert.equal(git(sandbox,"rev-parse","HEAD"),r.submission.selected);
      const g=submission(c.domain,sandbox,c.basis,join(t,"separate"),join(t,"repeat.bundle")).grade;
      assert.deepEqual(g.checks,r.submission.grade.checks);assert.deepEqual(g.paths,r.submission.grade.paths);
      if(c.domain==="software")assert.deepEqual(g.field.checks.map(x=>[x.input,x.exit,x.passed]),r.submission.grade.field.checks.map(x=>[x.input,x.exit,x.passed]));
    }finally{rmSync(t,{recursive:true,force:true});}
  }
  console.log("Verified archive, SHA, request and tool attribution and business checks:",matrix.mode);
}
if(process.argv[2]==="--verify")verify(resolve(process.argv[3]));
else{const dest=resolve(process.argv[3]);archive(resolve(process.argv[2]),dest);verify(dest);}
