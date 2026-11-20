import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {filingFeedback} from "./guidance.mjs";

const prior=new URL("../../../research-evidence/pnwf-task-selection/2026-11-20/r4-window/",import.meta.url);
for(const arm of ["P","F"])test(arm+" feedback separates authority and named shortfall without changing the gate",()=>{
  const row=(mode)=>JSON.parse(readFileSync(new URL(mode+"/envelope-"+arm+"/row.json",prior)));
  const examples=[...row("mock").release.checks,...row("live").release.checks].map(c=>c.result);
  assert(examples.some(r=>r.refusal?.window?.unused?.some(s=>s.unusedKw===20)));
  assert(examples.some(r=>r.refusal?.reason==="UNUSED_WINDOW_POWER"));
  assert(examples.some(r=>r.ok));
  for(const result of examples){
    const saved=structuredClone(result),priority=filingFeedback(result,"priority"),hint=filingFeedback(result,"hint");
    assert.equal(priority.ok,hint.ok);assert.equal(priority.ok,result.ok);
    assert.deepEqual(priority.power,hint.power);assert.deepEqual(result,saved);
    assert(!/unusedKw|UNUSED_WINDOW_POWER|"unused":/.test(JSON.stringify(priority)));
    assert(!JSON.stringify(hint).includes("取代 21:00"));
    if(result.window){
      assert.equal(priority.window.authority,result.window.authority);
      assert.deepEqual(hint.window.unused,result.window.unused);
    }
    if(result.refusal?.reason==="UNUSED_WINDOW_POWER"){
      assert.equal(priority.refusal.reason,"FILING_REVIEW_REQUIRED");
      assert.equal(hint.refusal.unused[0].unusedKw,20);
    }
  }
});
