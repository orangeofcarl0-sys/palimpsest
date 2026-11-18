import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {prepare,checkpoint,request,rehearse} from "./case.mjs";

const git=(cwd,...args)=>execFileSync("git",args,{cwd,encoding:"utf8"}).trim();
function draft(world){
  mkdirSync(join(world,"handover"));
  writeFileSync(join(world,"handover/shift.md"),"Edge green; display state unresolved. Compare panel spans to retries.");
  git(world,"add","handover");git(world,"-c","commit.gpgsign=false","commit","-qm","File provisional rehearsal advice");
  return git(world,"rev-parse","HEAD");
}
function paints(body){
  return body.split("\n\n")[0].split("\n").slice(1).map(line=>line.split("\t")).filter(row=>row[5]==="P");
}
test("identical starting Git objects and monitor, divergent panel outcomes after the checkpoint",t=>{
  const temp=mkdtempSync(join(tmpdir(),"night-shift-"));t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const rounds=["redraw","suppressed"].map(variant=>{
    const root=join(temp,variant),{world,basis}=prepare(root,variant);
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,["bench/check.mjs"],{cwd:world})),{edgeErrors:0,decision:"continue"});
    assert.equal(git(world,"ls-files","*terminal.tsv","*seal.json","*requests.jsonl"),"");
    assert.throws(()=>request(root,"terminal"),/desk opens/);
    assert.throws(()=>checkpoint(root,basis),/draft SHA/);
    const sha=draft(world);checkpoint(root,sha);
    assert.throws(()=>checkpoint(root,sha),/EEXIST/);
    assert.throws(()=>request(root,"../seal.json"),/unknown archive topic/);
    const data=Object.fromEntries(["inventory","ingress","field","reservation","terminal"].map(key=>[key,request(root,key)]));
    const rows=paints(data.terminal);
    assert.deepEqual(rows.filter(r=>r[2]==="A").map(r=>r[1]),["p04","p09"]);
    assert.equal(rows.filter(r=>r[1]==="p23").length,0);
    assert(data.ingress.includes("req-a,B,40,2,0") && data.reservation.includes("Cedar has the only REST"));
    const audit=readFileSync(join(root,"requests.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
    assert.equal(audit.length,5);assert(audit.every(r=>r.commit===sha));
    return {basis,data,seq:rows.filter(r=>r[1]==="p17").map(r=>Number(r[3]))};
  });
  const [a,b]=rounds;assert.equal(a.basis,b.basis);
  for(const key of ["inventory","ingress","field","reservation"])assert.equal(a.data[key],b.data[key]);
  assert.equal(a.data.terminal.replace("40\treq-a\tP\n\n","40\treq-a\tS\n\n"),b.data.terminal);
  assert.deepEqual(a.seq,[40,41,40]);assert.deepEqual(b.seq,[40,41]);
});
test("the booking desk reviews the exact proposed version and can refuse a technically plausible fallback",t=>{
  const root=mkdtempSync(join(tmpdir(),"night-booking-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const trial=join(root,"trial"),{world}=prepare(trial,"redraw");
  const initial=draft(world);checkpoint(trial,initial);
  function submit(startUtc,birch,cedar){
    writeFileSync(join(world,"handover/proposal.json"),JSON.stringify({startUtc,birch,cedar}));
    git(world,"add","handover");git(world,"-c","commit.gpgsign=false","commit","-qm","Revise morning coverage");
    return rehearse(trial,git(world,"rev-parse","HEAD"));
  }
  const first=submit("06:00","overflow","observe");
  assert.equal(first.booking,"conflict");assert(first.reasons[0].includes("CAP-08"));
  assert.equal(submit("06:15","park","overflow").booking,"feasible");
  assert.equal(submit("06:30","overflow","overflow").booking,"conflict");
  const after=submit("06:30","overflow","observe");
  assert.equal(after.booking,"feasible");assert.equal(after.productionApproval,"unissued");
  assert.notEqual(after.proposalBlob,first.proposalBlob);
  assert.throws(()=>rehearse(trial,first.commit),/current proposal SHA/);
});
