import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {copyFileSync,mkdirSync,readFileSync,readdirSync,existsSync,writeFileSync} from "node:fs";
import {join,dirname,resolve} from "node:path";
import {analyzeAttributedStage,readStream} from "../../analyze_energy_trajectory.mjs";
import {readJson,writeJson,git,digest} from "../../energy/contract.mjs";

const [source,destination]=process.argv.slice(2);
assert(source && destination,"Provide a stopped run directory and a new archive directory");
const out=resolve(destination), run=resolve(source);
mkdirSync(out,{recursive:true});
assert(!existsSync(join(out,"result.json")),"Archive already exists");
const result=readJson(join(run,"result.json"));
const files=["result.json","contract.json","prompt.txt","out/ROLLOUT/run.log","out/ROLLOUT/qualification.json",
  "out/ROLLOUT/request-accounting.json","out/ROLLOUT/request-observations.jsonl"];
const timelines="out/ROLLOUT/attribution";
if(existsSync(join(run,timelines)))for(const f of readdirSync(join(run,timelines)))if(f.endsWith(".json"))files.push(timelines+"/"+f);
const streams="runtime-ROLLOUT/sessions";
for(const f of readdirSync(join(run,streams),{recursive:true}).filter(x=>x.endsWith(".jsonl.zstd")))files.push(streams+"/"+f.replaceAll("\\","/"));
const hashes={};
for(const name of files) {
  const path=join(run,name),bytes=readFileSync(path);
  hashes[name]=digest(bytes);
  const content=name.endsWith(".zstd")?JSON.stringify(readStream(path,hashes[name])):bytes.toString();
  assert(!/(?:oc_sk_|sk-proj-|github_pat_|ghp_)[\w.-]{32,}/.test(content),"Unexpected credential in "+name);
  mkdirSync(dirname(join(out,name)),{recursive:true});
  copyFileSync(path,join(out,name));
}
if(result.attribution)assert.deepEqual(analyzeAttributedStage(out,"ROLLOUT",{context:true,result}),result.attribution);
const world=join(run,"stages/ROLLOUT/world");
if(result.business) {
  mkdirSync(join(out,"rollout"));
  for(const name of ["rollout/plan.json","rollout/REVIEW.md"]) {
    const bytes=execFileSync("git",["-C",world,"show",result.candidate+":"+name]);
    hashes[name]=digest(bytes);
    writeFileSync(join(out,name),bytes);
  }
}
git(world,"bundle","create",join(out,"project.bundle"),"HEAD");
git(world,"bundle","verify",join(out,"project.bundle"));
hashes["project.bundle"]=digest(readFileSync(join(out,"project.bundle")));
writeJson(join(out,"manifest.json"),hashes);
console.log(result.mode,result.qualified,Object.keys(hashes).length,"files bound");
