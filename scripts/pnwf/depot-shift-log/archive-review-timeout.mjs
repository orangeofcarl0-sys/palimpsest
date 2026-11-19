import assert from "node:assert/strict";
import {copyFileSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {DatabaseSync} from "node:sqlite";
import {digest,readJson,writeJson} from "../energy/contract.mjs";

const [archive,output]=process.argv.slice(2);
const root=resolve(archive),dir=join(root,"P"),source=join(dir,"request-ledger.sqlite");
const scratch=mkdtempSync(join(tmpdir(),"depot-timeout-"));
try {
  const ledger=join(scratch,"ledger.sqlite");
  copyFileSync(source,ledger);
  const db=new DatabaseSync(ledger,{readOnly:true});
  let rows;
  try {rows=db.prepare("SELECT id,session,digest,state,actual,reason,usage FROM requests ORDER BY rowid").all();}
  finally {db.close();}
  const arm=readJson(join(root,"matrix.json")).arms[0];
  const request=rows.at(-1);
  assert.equal(rows.length,15);
  assert.equal(request.id,"4ea77f94-216f-42ae-ab53-1423dcb9fce1");
  assert(request.state==="UNKNOWN"&&request.reason==="PROVIDER_TIMEOUT"&&request.actual===null&&request.usage===null);
  assert(rows.slice(0,-1).every(r=>r.state==="SETTLED"));
  const confirmed=rows.slice(0,-1).reduce((sum,r)=>sum+r.actual,0);
  assert.equal(confirmed,arm.confirmed);
  const obs=readFileSync(join(dir,"out/REVIEW/request-observations.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
  const events=obs.filter(r=>r.requestId===request.id);
  assert.deepEqual(events.map(e=>e.kind),["ADMITTED"]);
  const checks=Object.values(arm.grade.checks);
  assert.equal(checks.filter(Boolean).length,5);assert.equal(checks.length,10);
  writeJson(resolve(output),{source:"depot-review-exit/live/P/request-ledger.sqlite",ledgerSha256:digest(readFileSync(source)),
    cohortId:arm.cohortId,ordinal:15,request,events,settled:14,confirmed,totalTokens:null,
    frozenGrade:arm.grade.checks,disposition:"ARCHIVED_UNKNOWN_SEPARATE_COHORT_AUTHORIZED"});
} finally {rmSync(scratch,{recursive:true,force:true});}
