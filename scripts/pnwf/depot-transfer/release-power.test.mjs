import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {readJson,writeJson} from "../energy/contract.mjs";
import {commit,git} from "../transit-desk/run.mjs";
import {grade} from "./case.mjs";
import {inspectRelease,measuredBench} from "./release-power.mjs";

const previous=fileURLToPath(new URL("../../../research-evidence/pnwf-task-selection/2026-11-20/depot-transfer/live/",import.meta.url));
const priorHeads={P:"5de198ab34f91693475688d9490a066fa61c1f44",F:"4fd15bbdcd0911f62b486a90efd6329df13e9fd4"};
for(const [arm,head] of Object.entries(priorHeads)){
  test(arm+" original 6/10 files cannot issue a clipped release",()=>{
    const dir=join(previous,"controller-"+arm),world=mkdtempSync(join(tmpdir(),"r7-power-test-"));
    try{
      const {basis}=readJson(join(dir,"row.json"));
      git(world,"init","-q");git(world,"fetch","-q",join(dir,"world.bundle"),"HEAD");
      git(world,"checkout","-q","--detach",head);
      assert.equal(grade("controller",world,basis,head).score,6);
      const denied=inspectRelease(world,basis,head),field=measuredBench("controller",world,head);
      assert.equal(denied.ok,false);
      assert.deepEqual(denied.refusal,field.power.refusal);
      assert.deepEqual(denied.refusal.violations,[{time:"01:00",requestedKw:70,limitKw:50,actualKw:50,excessKw:20}]);
      assert.equal(denied.refusal.reason,"REQUEST_POWER_EXCEEDS_LIMIT");
      assert.equal(inspectRelease(world,basis,basis).refusal.reason,"RESULT_DRIFT");
      writeJson(join(world,"operations/revision-receipt.json"),{withinLimits:true});
      const forged=commit(world,"Self-report a pass");
      assert.equal(inspectRelease(world,basis,forged).ok,false);
      const sheet=readJson(join(world,"shift-plan.json"));
      sheet.acKw=[80,40,65,80];writeJson(join(world,"shift-plan.json"),sheet);
      const both=commit(world,"Two excessive requests");
      assert.deepEqual(inspectRelease(world,basis,both).refusal.violations.map(v=>v.excessKw),[15,10]);
      sheet.acKw=[80,40,50,70];writeJson(join(world,"shift-plan.json"),sheet);
      const exact=commit(world,"Use legal setpoints");
      const stale=inspectRelease(world,basis,exact);
      assert.equal(stale.power.withinLimits,true);
      assert.equal(stale.refusal.reason,"RELEASE_EVIDENCE_MISMATCH");
      assert.deepEqual(measuredBench("controller",world,exact).departureKwh,[126,124]);
      writeJson(join(world,"release.json"),{evidenceSha:exact,at90:{A:"GO",B:"HOLD"},departureKwh:[126,124],
        marginKwh:[0,-6],at85:{A:"HOLD",B:"HOLD"}});
      assert.equal(inspectRelease(world,basis,commit(world,"Bind the corrected decision")).ok,true);
    }finally{rmSync(world,{recursive:true,force:true});}
  });
}
