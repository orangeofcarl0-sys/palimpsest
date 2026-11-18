import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {analyzeAttributedStage,readStream} from "../../analyze_energy_trajectory.mjs";
import {digest,git,readJson} from "../../energy/contract.mjs";
import {assess,inputs} from "./score.mjs";

const dir=resolve(process.argv[2]), report=readJson(join(dir,"result.json"));
const manifest=readJson(join(dir,"manifest.json"));
for(const [name,sha] of Object.entries(manifest))assert.equal(digest(readFileSync(join(dir,name))),sha,name);
const streams=Object.entries(manifest).filter(([name])=>name.endsWith(".zstd")).map(([name,sha])=>readStream(join(dir,name),sha));
const principal=streams.find(events=>events[0].id===report.evidence?.principalId);
const children=streams.filter(events=>events[0].origin==="subagent");
if(report.mode==="mock" && report.qualified){
  assert.equal(children.length,3);
  for(const child of children){
    const session=child[0];
    assert.equal(session.parentSession,principal[0].id);
    const started=principal.find(e=>e.type==="tool/result" && e.data.message.content.some(b=>b.text?.includes("started subagent "+session.id)));
    assert(started,"Missing native subagent start receipt");
    const measurement=child.find(e=>e.type==="tool/result").data.message.content[0].text.trim();
    const findings=report.contributions.filter(c=>{
      const blocks=JSON.parse(c.record.finding.slice(c.record.finding.indexOf(" measured ")+10));
      return blocks.some(b=>b.text.trim()===measurement);
    });
    assert.equal(findings.length,1);
    assert(findings[0].decisions.some(d=>d.record.decision==="ACCEPT_AS_CANDIDATE"));
  }
}
if(report.attribution)assert.deepEqual(analyzeAttributedStage(dir,"ROLLOUT",{context:true,result:report}),report.attribution);
const fixture=fileURLToPath(new URL("../../../../fixtures/psvr/fleet-rollout/",import.meta.url));
const temp=mkdtempSync(join(tmpdir(),"verify-fleet-"));
try {
  git(temp,"init","-q");git(temp,"fetch","-q",join(dir,"project.bundle"),"HEAD");
  if(report.candidate)assert.equal(git(temp,"rev-parse","FETCH_HEAD"),report.candidate);
  assert.equal(git(temp,"rev-parse",report.basis+"^"),report.seal.accepted);
  for(const file of inputs){
    const original=readFileSync(join(fixture,file));
    assert.equal(digest(original),report.seal.files["fixtures/psvr/fleet-rollout/"+file]);
    assert.equal(git(temp,"rev-parse",report.basis+":fleet/"+file),git(temp,"hash-object",join(fixture,file)));
  }
  if(report.business)assert.deepEqual(assess(temp,report.basis,report.candidate,fixture),report.business);
  console.log(report.mode,report.qualified?"passed":"original outcome retained",report.basis);
} finally {rmSync(temp,{recursive:true,force:true});}
