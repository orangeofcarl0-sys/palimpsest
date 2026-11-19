import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {commitAll} from "../energy/contract.mjs";
import {energyGrade,prepareEnergy,source} from "./energy.mjs";

test("energy score distinguishes the single-site amendment, protected results and alternative freight representation",()=>{
  const dir=mkdtempSync(join(tmpdir(),"routing-price-test-"));
  try{
    const basis=prepareEnergy(dir),score=sha=>energyGrade(dir,basis,sha);
    assert.equal(score(basis).passed,false);
    const path=name=>join(dir,"deliverables",name);
    const cost=JSON.parse(readFileSync(path("cost-model.json")));
    const hf=cost.lines.find(l=>l.site==="Harbor Flats");
    hf.lastMileSurcharge=7500;hf.lineTotal+=7500;cost.total+=7500;
    const save=()=>writeFileSync(path("cost-model.json"),JSON.stringify(cost));
    save();
    const rec=readFileSync(path("recommendation.md"),"utf8").replaceAll("536,000","543,500").replace("536000","543500");
    writeFileSync(path("recommendation.md"),rec+"\n"+source);
    writeFileSync(path("risk-review.md"),"Reconcile the USD 7,500 Harbor Flats supplement.");
    assert.equal(score(commitAll(dir,"Update single consignment")).passed,true);
    delete hf.lastMileSurcharge;hf.freight+=7500;save();assert.equal(score(commitAll(dir,"Fold supplement into freight")).passed,true);
    cost.lines.find(l=>l.site==="North Ridge").freight+=7500;save();
    writeFileSync(path("vendor-compliance.md"),"replacement");
    const result=score(commitAll(dir,"Apply erroneous blanket surcharge and replace certificate record"));
    assert.equal(result.checks.north,false);assert.equal(result.checks.preserved,false);assert.equal(result.passed,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
