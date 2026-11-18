import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename,dirname,join,relative,resolve} from "node:path";
import {readStream} from "../../analyze_energy_trajectory.mjs";
import {digest,git,readJson,writeJson} from "../../energy/contract.mjs";
import {history,historyPath,maintainer,grade,basis,previous,recordRef} from "./fixture.mjs";
import {id,analyze} from "./evidence.mjs";

const files=root=>readdirSync(root,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>join(e.parentPath,e.name));
const pathIn=(root,file)=>relative(root,file).replaceAll("\\","/");
function verify(root){
  const matrix=readJson(join(root,"matrix.json")),manifest=readJson(join(root,"manifest.json"));
  for(const [file,h] of Object.entries(manifest))assert.equal(digest(readFileSync(join(root,file))),h,file);
  for(const {arm} of matrix.cases){
    const dir=join(root,arm),r=readJson(join(dir,"result.json")),t=readJson(join(dir,"trajectory.json"));
    assert.deepEqual(JSON.parse(JSON.stringify(analyze(dir,matrix.mode))),t);
    const bundle=join(dir,"project.bundle"),audit=mkdtempSync(join(tmpdir(),"review-objects-"));
    try{
      git(audit,"init","-q");
      git(audit,"fetch","-q",bundle,"HEAD",recordRef+":"+recordRef);
      assert.equal(git(audit,"rev-parse","FETCH_HEAD"),r.head);
      assert.equal(git(audit,"rev-parse",recordRef),previous);
      assert.equal(git(audit,"merge-base",basis,r.head),basis);
      if(existsSync(join(dir,"final")))for(const path of files(join(dir,"final"))){
        const object=execFileSync("git",["-C",audit,"show",r.head+":"+pathIn(join(dir,"final"),path)]);
        assert(readFileSync(path).equals(object),path);
      }
    }finally{rmSync(audit,{recursive:true,force:true});}
    const full=join(dir,"continued-history.zstd");
    if(existsSync(full)){
      const seed=readFileSync(history),raw=readFileSync(full);
      assert(raw.subarray(0,seed.length).equals(seed));
      const ev=readStream(full,digest(raw)),boundary=readStream(history,digest(seed)).at(-1).seq;
      const window=join(dir,"runtime-"+id,historyPath);
      assert.deepEqual(readStream(window,digest(readFileSync(window))),[ev[0],...ev.filter(e=>e.seq>boundary)]);
    }else assert(!t.traces.some(s=>s.session===maintainer));
    const g=grade(join(dir,"project.bundle"),r.head,matrix.seal.image);
    assert.equal(g.passed,r.grade.passed);
    assert.deepEqual(g.checks.map(c=>[c.event,c.input,c.exit,c.passed]),r.grade.checks.map(c=>[c.event,c.input,c.exit,c.passed]));
  }
  console.log("Verified archived traces, request usage, candidate P/S grades:",matrix.mode);
}
function archive(source,dest){
  mkdirSync(dest,{recursive:true});assert(!existsSync(join(dest,"manifest.json")));
  const matrix=readJson(join(source,"matrix.json"));
  function copy(from,to){mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to);}
  for(const name of ["matrix.json","baseline-grade.json"])copy(join(source,name),join(dest,name));
  for(const {arm} of matrix.cases){
    const src=join(source,arm),out=join(dest,arm);mkdirSync(out);
    for(const name of ["result.json","project.bundle","prompt.txt","trajectory.json","cohort.json"]){
      if(existsSync(join(src,name)))copy(join(src,name),join(out,name));
    }
    for(const dir of ["out/"+id,"runtime-"+id+"/sessions"]){
      for(const path of files(join(src,dir)).filter(p=>dir.startsWith("out/")?!p.endsWith(".md"):p.endsWith(".zstd")))copy(path,join(out,pathIn(src,path)));
    }
    const full=join(src,"raw-sessions",...historyPath.split("/").slice(1));
    if(readFileSync(full).length!==readFileSync(history).length)copy(full,join(out,"continued-history.zstd"));
    const r=readJson(join(src,"result.json")),world=join(src,"stages",id,"world");
    for(const name of r.changed){
      if(!/^[\w./ -]+$/.test(name)||name.split("/").includes(".."))continue;
      const tree=execFileSync("git",["-C",world,"ls-tree",r.head,"--",name],{encoding:"utf8"});
      if(!/^100(?:644|755) blob /.test(tree))continue;
      const p=join(out,"final",name);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,execFileSync("git",["-C",world,"show",r.head+":"+name]));
    }
  }
  const hashes={};
  for(const path of files(dest)){
    const bytes=readFileSync(path),h=digest(bytes);
    const text=path.endsWith(".zstd")?JSON.stringify(readStream(path,h)):bytes.toString();
    assert(!/(?:oc_sk_|sk-proj-|github_pat_|ghp_)[\w.-]{32,}/u.test(text),"Credential-shaped value in "+basename(path));
    hashes[pathIn(dest,path)]=h;
  }
  writeJson(join(dest,"manifest.json"),hashes);verify(dest);
}
if(process.argv[2]==="--verify")verify(resolve(process.argv[3]));else archive(resolve(process.argv[2]),resolve(process.argv[3]));
