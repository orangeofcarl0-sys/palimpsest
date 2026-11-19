import assert from "node:assert/strict";
import {resolve,join} from "node:path";
import {existsSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {git} from "../transit-desk/run.mjs";
import {digest,readJson,writeJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {reviewPhases} from "./review-phases.mjs";

const [previous,current,out]=process.argv.slice(2);
function materialAudit(bundle,paths,basis,head){
  const db=mkdtempSync(join(tmpdir(),"review-exit-blobs-"));
  try{
    git(db,"init","-q");git(db,"fetch","-q",bundle,"HEAD");
    assert.equal(git(db,"rev-parse","FETCH_HEAD").trim(),head);
    return paths.map(path=>{
      const entry=sha=>git(db,"ls-tree",sha,"--",path).trim().split("\t")[0];
      const before=entry(basis),after=entry(head);
      return {path,before,after,preserved:/^100(?:644|755) blob [a-f0-9]{40}$/u.test(before)&&before===after};
    });
  }finally{rmSync(db,{recursive:true,force:true});}
}
function recount(root){
  const matrix=readJson(join(root,"matrix.json"));
  const arm=matrix.arms.find(row=>row.arm==="P");
  const phases=reviewPhases(join(root,"P"));
  // The container and Windows host have separate clocks. Subtract timestamps
  // only within one clock; retain host startup and process exit as separate facts.
  const file=join(root,"P/desk/latest.zstd");
  const stream=existsSync(file)?readStream(file,digest(readFileSync(file))):[];
  for(const review of phases.reviews.filter(r=>r.measured)){
    const opened=stream.find(e=>e.type==="turn/start"&&e.data.turn===review.turn);
    const result=stream.find(e=>e.seq===review.result);
    const ended=stream.find(e=>e.seq===review.turnEnd);
    review.turnToResultMs=result.time-opened.time;
    review.resultToTurnEndMs=ended?ended.time-result.time:null;
    delete review.returnToTurnEndMs;
  }
  const summarize=phase=>{
    const total={requests:0,tokens:0,elapsedMs:0};
    for(const review of phases.reviews.filter(r=>r.measured)){
      total.requests+=review[phase].requests;
      total.tokens+=review[phase].total;
      const elapsed=phase==="before"?review.turnToResultMs:review.resultToTurnEndMs;
      total.elapsedMs=elapsed===null||total.elapsedMs===null?null:total.elapsedMs+elapsed;
    }
    return total;
  };
  return {basis:arm.basis,head:arm.head,promptDigest:arm.promptDigest,window:matrix.seal.window,
    model:matrix.seal.model,materialsDigest:matrix.seal.materials.digest,
    requests:arm.requests,confirmed:arm.confirmed,unknown:arm.unknown,
    natural:arm.execution.natural,conclusion:arm.journal?.intent??null,checks:arm.grade.checks,
    protectedFiles:materialAudit(join(root,"P/world.bundle"),matrix.seal.materials.rules.mustPreserve,arm.basis,arm.head),
    before:summarize("before"),after:summarize("after"),...phases};
}
const old=recount(resolve(previous)),now=recount(resolve(current));
for(const key of ["basis","promptDigest","window","model","materialsDigest"])assert.deepEqual(now[key],old[key]);
writeJson(resolve(out),{previous:old,current:now});
