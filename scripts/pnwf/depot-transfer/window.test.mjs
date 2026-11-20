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

const archive=fileURLToPath(new URL("../../../research-evidence/pnwf-task-selection/2026-11-20/r4-release-power/live/",import.meta.url));
for(const arm of ["P","F"])test("R4 "+arm+" frozen 6/10 leaves 20 kW available for B",()=>{
  const dir=join(archive,"envelope-"+arm),row=readJson(join(dir,"row.json"));
  const world=mkdtempSync(join(tmpdir(),"r4-window-test-"));
  try{
    git(world,"init","-q");git(world,"fetch","-q",join(dir,"world.bundle"),"HEAD");
    git(world,"checkout","-q","--detach",row.head);
    assert.equal(grade("envelope",world,row.basis,row.head).score,6);
    assert.equal(row.release.filed,true);
    assert.deepEqual(inspectRelease(world,row.basis,row.head,{requireFullWindow:false}),row.release.check);
    const result=inspectRelease(world,row.basis,row.head);
    assert.equal(result.refusal.reason,"UNUSED_WINDOW_POWER");
    assert.equal(result.window.source,"DUTY-2340");
    assert.equal(result.window.measuredSha,originalSha);
    assert.deepEqual(result.refusal.unused,[{time:"01:30",bus:"B",requestedKw:50,availableKw:70,unusedKw:20}]);
    const plan=readJson(join(world,"shift-plan.json"));
    plan.acKw[3]=70;writeJson(join(world,"shift-plan.json"),plan);
    const corrected=commit(world,"Fill the measured vehicle window");
    const full=inspectRelease(world,row.basis,corrected);
    assert.equal(full.ok,true);assert.deepEqual(full.window.unused,[]);
    // Energy and decisions still belong to the independently graded filing.
    assert.equal(grade("envelope",world,row.basis,corrected).passed,false);
    plan.loadShiftKw=0;writeJson(join(world,"shift-plan.json"),plan);
    assert.equal(inspectRelease(world,row.basis,commit(world,"Change measured conditions")).refusal.reason,"ORIGINAL_RECEIPT_NOT_APPLICABLE");
  }finally{rmSync(world,{recursive:true,force:true});}
});
