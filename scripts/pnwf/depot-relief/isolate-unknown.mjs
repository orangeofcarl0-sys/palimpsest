import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {prior} from "./case.mjs";
import {readJson,digest} from "../energy/contract.mjs";
export function oldRequest(){
  const dir=join(prior,"depot-charge-F"),path=join(dir,"request-ledger.sqlite");
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    const rows=db.prepare("SELECT id,state,actual,reason,usage FROM requests ORDER BY rowid").all();
    const obs=readFileSync(join(dir,"out/REVIEW/request-observations.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
    const r=rows[2];
    assert.equal(rows.length,3);assert.equal(r.id,"0fd80c27-fbfb-443b-900c-ecd0836986ab");
    assert(r.state==="UNKNOWN"&&r.actual===null&&r.usage===null&&r.reason==="PROVIDER_TIMEOUT");
    const events=obs.filter(o=>o.requestId===r.id);
    assert.deepEqual(events.map(e=>e.kind),["ADMITTED"]);
    assert(rows.slice(0,2).every(x=>x.state==="SETTLED"));
    return {source:"../transit-desk-live/depot-charge-F/request-ledger.sqlite",ledgerSha256:digest(readFileSync(path)),
      cohortId:readJson(join(dir,"cohort.json")).cohortId,ordinal:3,request:{...r},events,knownTokens:rows[0].actual+rows[1].actual,
      totalTokens:null,disposition:"ARCHIVED_UNKNOWN_SEPARATE_COHORT_AUTHORIZED"};
  }finally{db.close();}
}
