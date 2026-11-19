import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {test} from "node:test";
import {commit,git} from "../transit-desk/run.mjs";
import {writeJson} from "../energy/contract.mjs";
import {measure,publicLog} from "../depot-shift-log/case.mjs";
import {bench,originalSha,prepare,tickets} from "./case.mjs";

test("the original receipts have identical readings; only the revised vehicle-side measurement distinguishes release",()=>{
  const temp=mkdtempSync(join(tmpdir(),"depot-meter-test-")),observations=[];
  try{
    for(const ticket of tickets){
      const world=join(temp,ticket),basis=prepare(ticket,world);
      const original=bench(ticket,world,originalSha);
      writeFileSync(join(world,"HANDOVER.md"),"draft\n");
      const docs=commit(world,"Change handover only");
      assert.deepEqual(bench(ticket,world,docs).departureKwh,[126,121]);
      assert.deepEqual(bench(ticket,world,docs).auxiliaryMeterB,original.auxiliaryMeterB);
      const plan=JSON.parse(git(world,"show",basis+":shift-plan.json"));
      plan.acKw=[80,40,50,70];writeJson(join(world,"shift-plan.json"),plan);
      const sha=commit(world,"Revise B settings");
      const field=bench(ticket,world,sha),local=measure(world,sha,publicLog);
      assert.equal(field.sha,sha);assert.deepEqual(field.departureKwh,[126,ticket==="controller"?124:130]);
      observations.push({original,field,local,tree:git(world,"ls-tree","-r",basis).trim().split("\n")
        .filter(s=>!s.endsWith("\toperations/original-receipt.json"))});
    }
    const [a,b]=observations;
    const {applicability:scopeA,...first}=a.original,{applicability:scopeB,...second}=b.original;
    assert.notEqual(scopeA,scopeB);assert.deepEqual(first,second);
    assert.deepEqual(a.tree,b.tree);
    assert.deepEqual(a.field.actual,b.field.actual);
    assert.deepEqual(a.local.departureKwh,b.local.departureKwh);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
