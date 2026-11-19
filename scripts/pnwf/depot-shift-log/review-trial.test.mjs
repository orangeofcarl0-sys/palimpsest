import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {terminalTrial} from "./review-trial.mjs";
import {reviewPhases} from "./review-phases.mjs";
import {readJson} from "../energy/contract.mjs";

const previous=new URL("../../../research-evidence/pnwf-task-selection/2026-11-19/depot-material-obligations/live/P/",import.meta.url);
const events=readJson(new URL("desk/journal.json",previous));
test("attribute both old review tails to their own measured turns",()=>{
  const {reviews,unassigned}=reviewPhases(fileURLToPath(previous));
  assert.deepEqual(reviews.map(r=>[r.before.requests,r.after.requests,r.result,r.turnEnd]),
    [[3,16,208,338],[1,10,355,429]]);
  assert.equal(reviews.reduce((sum,r)=>sum+r.after.total,0),1787759);
  assert.equal(unassigned.requests,0);
});
test("only the issued measurement and handoff for this pinned review conclude its turn",async()=>{
  for(const {sha,receipt} of events.filter(e=>e.kind==="RETURN")){
    const other="0".repeat(40);
    for(const [args,result,expected] of [
      [{sha},{ok:true,receipt,deliveredSha:sha},1],
      [{sha},{ok:true,receipt},0],
      [{sha},{ok:false,receipt,deliveredSha:sha},0],
      [{sha},{ok:true,receipt,deliveredSha:other},0],
      [{sha:other},{ok:true,receipt,deliveredSha:sha},0],
      [{sha},{ok:true,receipt:{...receipt,sha:other},deliveredSha:sha},0],
    ]){
      let conclusions=0;
      const tool=terminalTrial({name:"depot_trial",execute:async()=>result},sha);
      assert.equal(await tool.execute(args,{concludeTurn:()=>conclusions++}),result);
      assert.equal(conclusions,expected);
    }
    const lookup={name:"depot_shift_log"};
    assert.equal(terminalTrial(lookup,sha),lookup);
  }
});
