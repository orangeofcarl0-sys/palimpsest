import assert from "node:assert/strict";
import {appendFileSync,cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {changed,clean,configureGit,git,head,readJson,writeJson} from "../energy/contract.mjs";
import {stageRuntime} from "../energy/container-worker.mjs";
import {archive,basis as softwareBase,prompt as business,grade as replayGrade,maintainer,previous,recordRef} from "../software/night-review/fixture.mjs";
import {here as desk,replayContract,recordsAt,prepareWorld} from "../software/night-isolated/contract.mjs";
import {prepareEnergy,goal as energyGoal,energyGrade} from "./energy.mjs";

export const here=fileURLToPath(new URL("./",import.meta.url));
export const repo=resolve(here,"../../..");
export const goals={software:business+" The dispatch desk publishes its capture catalogue and replay contract in /run/dispatch-records.",energy:energyGoal};
export const previousContract=readJson(join(archive,"matrix.json")).seal;
export function runtime(root){
  const base=join(root,"staging"),destination=join(root,"runtime");
  stageRuntime({repo,destination:base});
  mkdirSync(destination);
  for(const p of ["dist","node_modules","package.json","host"])cpSync(join(base,p),join(destination,p),{recursive:true});
  const w=join(destination,"runtime/worker");mkdirSync(w,{recursive:true});
  cpSync(join(base,"runtime/worker/package.json"),join(w,"package.json"));
  cpSync(join(here,"worker.js"),join(w,"index.js"));
  cpSync(join(here,"product-entry.mjs"),join(destination,"runtime/product-entry.mjs"));
  return destination;
}
export function prepare(domain,world,records){
  if(domain==="energy")return prepareEnergy(world);
  recordsAt(records);prepareWorld(world,records);writeFileSync(join(world,".git/principal-only"),"principal");return softwareBase;
}
export function deskProfile(home){
  const dir=join(home,"profiles/node_modules/pnwf-isolated-review");
  cpSync(join(desk,"plugin"),dir,{recursive:true});
  writeJson(join(dir,"role.json"),{role:"principal",contactAvailable:true,session:maintainer,previous,recordRef,contract:replayContract,catalogue:"/run/dispatch-records/contract.json",cases:["/run/dispatch-records/P.tsv","/run/dispatch-records/S.tsv"]});
  appendFileSync(join(home,"profiles/alhs-core/cordis.patch.yml"),"\n- insert:\n    - id: pnwf-isolated-review\n      name: pnwf-isolated-review\n");
}
export function workerPolicy(projectId){
  return {projectId,requirements:[],preservedPath:null,
    checkScope(paths){assert(Array.isArray(paths)&&paths.length>0);},
    checkResult(world,basis,sha,scope){
      assert(clean(world)&&head(world)===sha&&git(world,"merge-base",basis,sha)===basis);
      const paths=changed(world,basis,sha);
      assert(paths.length&&paths.every(p=>scope.some(s=>p===s||p.startsWith(s.replace(/\/$/,"")+"/"))));
      return paths;
    }};
}
function softwareGrade(world,basis,sha,bundle){
  const field=replayGrade(bundle,sha,previousContract.image);
  const protectedPaths=git(world,"ls-tree","-r","--name-only",basis,"--","handover/evidence","handover/booking-receipt.json","handover/proposal.json","planning","service","proto","operations").split("\n");
  const paths=changed(world,basis,sha);
  const checks={P:field.checks[0].passed,S:field.checks[1].passed,preserved:protectedPaths.every(p=>!paths.includes(p)),handover:paths.includes("handover/HANDOVER.md")};
  return {checks,passed:Object.values(checks).every(Boolean),field,paths};
}
export function submission(domain,world,basis,run,outfile){
  const out=join(run,"out/REVIEW"),receipts=join(out,"worker-receipts.json");
  const t=mkdtempSync(join(tmpdir(),"route-candidate-"));
  try{
    git(t,"clone","-q","--no-local",world,".");configureGit(t);
    const cleanWorld=clean(world),workingHead=head(world);
    const tips=new Set(git(world,"for-each-ref","--format=%(objectname)","refs/heads").split("\n").concat(workingHead).filter(s=>s!==basis&&git(world,"merge-base",basis,s)===basis));
    for(const job of existsSync(receipts)?readJson(receipts):[]){
      if(job.outcome!=="READY_FOR_SETTLEMENT"||!job.result)continue;
      git(t,"fetch","-q",join(out,"worker-"+job.attemptId,"result.bundle"),"refs/heads/pnwf-worker-result");tips.add(job.result);
    }
    const maximal=[...tips].filter(a=>![...tips].some(b=>a!==b&&git(t,"merge-base",a,b)===a));
    const selected=maximal.length===1?maximal[0]:basis;
    git(t,"checkout","-q","--detach",selected);git(t,"bundle","create",outfile,"HEAD");
    const grade=domain==="software"?softwareGrade(t,basis,selected,outfile):energyGrade(t,basis,selected);
    return {workingHead,cleanWorld,basis,selected,maximal,commits:git(t,"rev-list","--reverse",basis+".."+selected).split("\n").filter(Boolean),grade,delivered:cleanWorld&&maximal.length===1&&grade.passed};
  }finally{rmSync(t,{recursive:true,force:true});}
}
