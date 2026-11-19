import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {archive,basis,previous} from "../night-review/fixture.mjs";
import {digest,readJson} from "../../energy/contract.mjs";
import {classify,recordsAt} from "./contract.mjs";

test("dispatch catalogue keeps both original captures and their separate provenance",()=>{
  const root=mkdtempSync(join(tmpdir(),"dispatch-catalogue-"));
  try{
    const records=recordsAt(join(root,"records"));
    assert.notEqual(records.P.sha256,records.S.sha256);
    for(const [event,arm,sha] of [["P","redraw-solo",basis],["S","suppressed-solo",previous]]){
      const bytes=readFileSync(join(archive,arm,"desk/packets/terminal.tsv"));
      assert.equal(records[event].source,sha);
      assert.equal(records[event].sha256,digest(bytes));
      assert.deepEqual(readFileSync(join(root,"records",event+".tsv")),bytes);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("receipt carries measured facts and digests even when stdout contains prose or invalid JSON",()=>{
  const input="1".repeat(64);
  const row={event:"S",input,exit:1,stdout:JSON.stringify({note:"private text",diagnosis:{reproduced:false,liveInversions:[]}}),stderr:"private text"};
  const m=classify(basis,"S",row);
  assert.deepEqual(m,{sha:basis,capture:"S",inputDigest:input,exit:1,reproduced:false,inversions:0,p17At40:false,stdoutDigest:digest(row.stdout),stderrDigest:digest(row.stderr)});
  assert.equal(classify(basis,"S",{...row,stdout:"private text"}).reproduced,null);
  assert.throws(()=>classify(basis.slice(0,8),"S",row));
  assert.throws(()=>classify(basis,"P",row));
});

test("prior real pair keeps its original zero of two for each arm",()=>{
  for(const arm of ["auto","solo"]){
    const {grade}=readJson(join(archive,"../../night-review/live",arm,"result.json"));
    assert.deepEqual(grade.checks.map(c=>[c.event,c.passed]),[["P",false],["S",false]]);
    assert.equal(grade.unchangedEvidence,false);
  }
});
