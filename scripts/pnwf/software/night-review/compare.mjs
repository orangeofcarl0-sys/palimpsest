import {join,resolve} from "node:path";
import {readJson,writeJson} from "../../energy/contract.mjs";

const root=resolve(process.argv[2]);
const cases=readJson(join(root,"matrix.json")).cases.map(({arm})=>{
  const dir=join(root,arm),r=readJson(join(dir,"result.json")),t=readJson(join(dir,"trajectory.json"));
  const usage={};
  for(const b of t.bindings){
    const a=usage[b.role]??={requests:0,fresh:0,cacheRead:0,cacheWrite:0,output:0};
    a.requests++;a.fresh+=b.usage.input_tokens;a.cacheRead+=b.usage.cache_read_input_tokens;
    a.cacheWrite+=b.usage.cache_creation_input_tokens;a.output+=b.usage.output_tokens;
  }
  const roles=t.traces.map(trace=>({session:trace.session,role:trace.role,paired:trace.calls.filter(c=>c.resultSeq!==null).length,
    tools:trace.calls.length,directory:trace.calls.filter(c=>c.tool==="fleet_register").map(c=>c.seq),
    contacts:trace.calls.filter(c=>c.tool==="fleet_contact").map(c=>({seq:c.seq,response:c.resultSeq,question:c.input.question})),
    conclusions:trace.calls.filter(c=>c.tool==="palimpsest_work"&&c.input?.action==="conclude").map(c=>({seq:c.seq,intent:c.input.intent,result:c.reply.slice(0,150)}))}));
  return {arm,head:r.head,changed:r.changed,clean:r.clean,elapsedMs:Date.parse(r.execution.endedAt)-Date.parse(r.execution.startedAt),
    natural:r.execution.natural,stop:r.execution.killedBy,requests:t.bindings.length,confirmed:t.confirmed,unknown:t.unknown,usage,roles,
    originalTerminalPreserved:r.grade.unchangedEvidence,checks:r.grade.checks.map(c=>({input:c.event,exit:c.exit,passed:c.passed})),qualifiedCandidate:r.grade.passed};
});
writeJson(resolve(process.argv[3]),{cases});
