import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {readJson,writeJson} from "../energy/contract.mjs";
import {commit,git} from "../transit-desk/run.mjs";
import {grade,originalSha} from "./case.mjs";
import {inspectRelease} from "./release-power.mjs";

const evidence=fileURLToPath(new URL("../../../research-evidence/pnwf-task-selection/",import.meta.url));
test("stopped R4 original retains 2/10 and cannot issue a clipped request",()=>{
  const dir=join(evidence,"2026-11-19/depot-transfer/live/envelope-P");
  const world=mkdtempSync(join(tmpdir(),"r4-original-"));
  try{
    const {head,basis}=readJson(join(dir,"row.json"));
    git(world,"init","-q");git(world,"fetch","-q",join(dir,"world.bundle"),"HEAD");
    git(world,"checkout","-q","--detach",head);
    assert.equal(grade("envelope",world,basis,head).score,2);
    const {refusal}=inspectRelease(world,basis,head);
    assert.equal(refusal.reason,"REQUEST_POWER_EXCEEDS_LIMIT");
    assert.deepEqual(refusal.violations,[{time:"01:00",requestedKw:70,limitKw:50,actualKw:50,excessKw:20}]);
  }finally{rmSync(world,{recursive:true,force:true});}
});
test("R4 original receipt covers only its frozen operating window",()=>{
  const dir=join(evidence,"2026-11-20/depot-transfer/live/envelope-F");
  const world=mkdtempSync(join(tmpdir(),"r4-reuse-"));
  try{
    const {head,basis}=readJson(join(dir,"row.json"));
    git(world,"init","-q");git(world,"fetch","-q",join(dir,"world.bundle"),"HEAD");
    git(world,"checkout","-q","--detach",head);
    assert.equal(inspectRelease(world,basis,head).ok,true);
    const release=readJson(join(world,"release.json")),plan=readJson(join(world,"shift-plan.json"));
    const amend=(path,data)=>{writeJson(join(world,path),data);return commit(world,"Check "+path);};
    const check=sha=>inspectRelease(world,basis,sha);
    assert.equal(check(amend("release.json",{...release,evidenceSha:"dummy"})).refusal.reason,"RELEASE_EVIDENCE_MISMATCH");
    const accepted=amend("release.json",{...release,evidenceSha:originalSha});
    assert.equal(check(accepted).evidenceMode,"ORIGINAL_RECEIPT_REUSED");
    for(const changed of [{bus:["A","B","A","B"]},{slotStart:["23:30",...plan.slotStart.slice(1)]},{loadShiftKw:10}]){
      const denied=check(amend("shift-plan.json",{...plan,...changed}));
      assert.equal(denied.refusal.reason,"ORIGINAL_RECEIPT_NOT_APPLICABLE");
    }
    assert.equal(check(amend("shift-plan.json",{...plan,acKw:[80,40,70,70]})).refusal.reason,"REQUEST_POWER_EXCEEDS_LIMIT");
    assert.equal(check(accepted).refusal.reason,"RESULT_DRIFT");
  }finally{rmSync(world,{recursive:true,force:true});}
});
