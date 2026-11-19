import assert from "node:assert/strict";
import {mkdtempSync,rmSync,appendFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {test} from "node:test";
import {here} from "./case.mjs";
import {basis,receiptPath,inspectFiles,inspectDelivery} from "./materials.mjs";
import {requireWorkRevision} from "../../../dist/src/work/revision.js";
import {git} from "../transit-desk/run.mjs";

const archive=resolve(here,"../../../research-evidence/pnwf-task-selection/2026-11-19");
for(const [arm,folder,candidate] of [
  ["P","depot-receipt-delivery","e9353b6928fa93554905b960588177c39271aae5"],
  ["F","depot-shift-log","1542584d87561fd46f3b29a0dd2a5a3c17327064"],
]) test(arm+" frozen 9/10 submission and repaired material set",()=>{
  const world=mkdtempSync(join(tmpdir(),"depot-materials-"));
  const commit=()=>{git(world,"add","-A");git(world,"-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-qm","Regression variant");return git(world,"rev-parse","HEAD").trim();};
  try {
    git(world,"init","-q");git(world,"fetch","-q",join(archive,folder,"live",arm,"world.bundle"),"HEAD");
    git(world,"checkout","-q","--detach",candidate);
    const receipt=inspectFiles(world,candidate);
    const damaged=["operations/desk.md","operations/retest.mjs"];
    assert.deepEqual(receipt.checks.filter(c=>c.kind==="MUST_PRESERVE"&&!c.passed).map(c=>c.path),damaged);
    assert.throws(()=>requireWorkRevision(receipt),e=>e.refusal.reason==="PROTECTED_FILE_CHANGED"&&e.refusal.nextAction==="FIX_CANDIDATE");
    assert(receipt.checks.some(c=>c.path==="operations/cold-cycle.json"&&c.basisBlob===c.candidateBlob&&c.passed));
    git(world,"restore","--source="+basis,"--",...damaged);
    const restored=commit();
    requireWorkRevision(inspectFiles(world,restored));
    // Both historical filings were summaries. File obligations alone cannot authenticate them.
    const filing=inspectDelivery(world,restored,join(archive,"depot-receipt-delivery/live/P/desk/receipts.sqlite"));
    assert.equal(filing.refusal.reason,"MEASURED_RECEIPT_MISMATCH");
    assert.throws(()=>inspectFiles(world,candidate),e=>e.refusal.reason==="RESULT_DRIFT");
    appendFileSync(join(world,"operations/cold-cycle.json"),"\n");
    assert.throws(()=>requireWorkRevision(inspectFiles(world,commit())),e=>e.refusal.reason==="PROTECTED_FILE_CHANGED"&&e.refusal.paths.includes("operations/cold-cycle.json"));
    git(world,"restore","--source="+basis,"--","operations/cold-cycle.json");
    git(world,"rm","-q",receiptPath);
    assert.throws(()=>requireWorkRevision(inspectFiles(world,commit())),e=>e.refusal.reason==="REQUIRED_FILE_MISSING");
  } finally { rmSync(world,{recursive:true,force:true}); }
});
