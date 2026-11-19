import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {digest,readJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";

function usage(rows) {
  const result={requests:rows.length,fresh:0,cacheRead:0,cacheWrite:0,output:0,total:0};
  for(const {usage:u} of rows){
    result.fresh+=u.input_tokens; result.cacheRead+=u.cache_read_input_tokens;
    result.cacheWrite+=u.cache_creation_input_tokens; result.output+=u.output_tokens;
  }
  result.total=result.fresh+result.cacheRead+result.cacheWrite+result.output;
  return result;
}

export function reviewPhases(dir) {
  const trajectory=readJson(join(dir,"trajectory.json"));
  const journal=readJson(join(dir,"desk/journal.json"));
  const bindings=trajectory.bindings.filter(b=>b.role==="maintainer");
  const calls=trajectory.traces.find(t=>t.role==="maintainer")?.calls??[];
  const file=join(dir,"desk/latest.zstd");
  const events=existsSync(file)?readStream(file,digest(readFileSync(file))):[];
  const accounted=new Set();
  const reviews=journal.filter(e=>e.kind==="START_REVIEW").map(start=>{
    const returned=journal.find(e=>e.kind==="RETURN"&&e.n===start.n);
    const exit=journal.find(e=>e.kind==="REVIEW_EXIT"&&e.n===start.n);
    const trial=calls.find(c=>c.tool==="depot_trial"&&c.input.sha===start.sha&&c.ok&&returned&&
      c.reply.includes(returned.receipt.captureDigest));
    if(!trial)return {sha:start.sha,measured:false,exit:exit??null};
    const result=events.find(e=>e.seq===trial.resultSeq&&e.type==="tool/result");
    assert.equal(result.data.message.toolCallId,trial.callId);
    const turn=result.data.turn;
    const end=events.find(e=>e.type==="turn/end"&&e.data.turn===turn);
    const turnSeqs=new Set(events.filter(e=>e.data?.turn===turn).map(e=>e.seq));
    const rows=bindings.filter(b=>turnSeqs.has(b.seq));
    for(const b of rows){assert(!accounted.has(b.id));accounted.add(b.id);}
    const returnedAt=Date.parse(returned.at);
    return {sha:start.sha,measured:true,turn,call:trial.seq,result:result.seq,turnEnd:end?.seq??null,
      reason:end?.data.reason.kind??null,exitCode:exit?.exitCode??null,
      before:usage(rows.filter(b=>b.seq<result.seq)),after:usage(rows.filter(b=>b.seq>result.seq)),
      launchToReturnMs:returnedAt-Date.parse(start.at),returnToTurnEndMs:end?end.time-returnedAt:null,
      returnToProcessExitMs:exit?Date.parse(exit.at)-returnedAt:null,
      queuedMs:Date.parse(start.at)-Date.parse(journal.find(e=>e.kind==="CONTACT"&&e.n===start.n).at)};
  });
  return {reviews,maintainer:usage(bindings),unassigned:usage(bindings.filter(b=>!accounted.has(b.id)))};
}
