import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname,resolve} from "node:path";
import {analyzeAttributedStage,readStream} from "../../analyze_energy_trajectory.mjs";
import {digest,git,readJson,writeJson} from "../../energy/contract.mjs";
import {rehearse} from "./case.mjs";

const id="NIGHT";
const filesIn = d=>readdirSync(d,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>join(e.parentPath,e.name));
function verify(root){
  const matrix=readJson(join(root,"matrix.json"));
  for(const {label} of matrix.cases){
    const dir=join(root,label), result=readJson(join(dir,"result.json"));
    const manifest=readJson(join(dir,"manifest.json"));
    for(const [name,h] of Object.entries(manifest))assert.equal(digest(readFileSync(join(dir,name))),h,name);
    if(result.attribution){
      // Optional observations such as a missing Attempt are omitted in stored JSON.
      const rebuilt=analyzeAttributedStage(dir,id,{context:true,result});
      assert.deepEqual(JSON.parse(JSON.stringify(rebuilt)),result.attribution);
    }
    const temp=mkdtempSync(join(tmpdir(),"night-verify-"));
    try{
      git(temp,"init","-q");git(temp,"fetch","-q",join(dir,"project.bundle"),"HEAD");
      if(result.head)assert.equal(git(temp,"rev-parse","FETCH_HEAD"),result.head);
      if(result.draft)assert.equal(git(temp,"merge-base",result.basis,result.draft),result.basis);
      const review=join(temp,".git","desk-audit");mkdirSync(review);
      if(result.draft)writeJson(join(review,"checkpoint.json"),{basis:result.basis,commit:result.draft});
      for(const booking of result.bookings??[]){
        git(temp,"checkout","-q","--detach",booking.commit);
        assert.deepEqual(rehearse(review,booking.commit,temp),booking);
      }
      for(const p of Object.keys(manifest).filter(k=>k.startsWith("final/")))assert.equal(git(temp,"rev-parse",result.head+":"+p.slice(6)),git(temp,"hash-object",join(dir,p)));
    }finally{rmSync(temp,{recursive:true,force:true});}
  }
  console.log("Verified",matrix.cases.length,matrix.mode,"sessions");
}
function archive(root,out){
  mkdirSync(out,{recursive:true});assert(!existsSync(join(out,"matrix.json")));
  const matrix=readJson(join(root,"matrix.json"));
  for(const {label} of matrix.cases){
    const source=join(root,label),dir=join(out,label),world=join(source,"stages",id,"world");
    mkdirSync(dir);
    const rel=p=>p.slice(source.length+1).replaceAll("\\","/");
    const files=["result.json","prompt.txt","desk/seal.json",...["checkpoint.json","port.jsonl","requests.jsonl","rehearsals.jsonl"].map(p=>"desk/"+p),
      ...filesIn(join(source,"desk","packets")).map(rel),...filesIn(join(source,"out",id)).filter(p=>!p.endsWith(".md")).map(rel),
      ...filesIn(join(source,"runtime-"+id,"sessions")).filter(p=>p.endsWith(".jsonl.zstd")).map(rel)];
    const hashes={};
    for(const name of files.filter(p=>existsSync(join(source,p)))){
      const path=join(source,name),bytes=readFileSync(path);
      hashes[name]=digest(bytes);
      const contents=name.endsWith(".zstd")?JSON.stringify(readStream(path,hashes[name])):bytes.toString();
      assert(!/(?:oc_sk_|sk-proj-|github_pat_|ghp_)[\w.-]{32,}/u.test(contents),"Credential-shaped value in "+name);
      mkdirSync(dirname(join(dir,name)),{recursive:true});copyFileSync(path,join(dir,name));
    }
    git(world,"bundle","create",join(dir,"project.bundle"),"HEAD");
    hashes["project.bundle"]=digest(readFileSync(join(dir,"project.bundle")));
    const result=readJson(join(dir,"result.json"));
    if(result.head)for(const path of result.changed??[]){
      if(!/^(?:handover|bench|test)\/[\w./ -]+$/.test(path) || path.split("/").includes(".."))continue;
      if(!/^100(?:644|755) blob /.test(git(world,"ls-tree",result.head,"--",path)))continue;
      const bytes=execFileSync("git",["-C",world,"show",result.head+":"+path]);
      mkdirSync(dirname(join(dir,"final",path)),{recursive:true});writeFileSync(join(dir,"final",path),bytes);
      hashes["final/"+path]=digest(bytes);
    }
    writeJson(join(dir,"manifest.json"),hashes);
  }
  copyFileSync(join(root,"matrix.json"),join(out,"matrix.json"));verify(out);
}
if(process.argv[2]==="--verify")verify(resolve(process.argv[3]));
else archive(resolve(process.argv[2]),resolve(process.argv[3]));
