import assert from "node:assert/strict";
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {tmpdir} from "node:os";
import {zstdCompressSync} from "node:zlib";
import {analyze} from "../task-selection/evidence.mjs";
import {stoppedEvidence} from "../transit-desk/stopped-evidence.mjs";
import {digest,readJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {history,streamPath,maintainer} from "./case.mjs";
export function evidencePaths(run) {
  const paths=["out/REVIEW/run.json","out/REVIEW/run.log","out/REVIEW/run.err","out/REVIEW/request-accounting.json","out/REVIEW/request-observations.jsonl",
    "out/REVIEW/qualification.json","out/REVIEW/worker-receipts.json","desk/latest.zstd","desk/journal.json","world.bundle","prompt.txt","cohort.json","previous-shift-slip.json"];
  for(const top of ["runtime-REVIEW/sessions","out/REVIEW","desk"]){
    if(!existsSync(join(run,top)))continue;
    for(const relative of readdirSync(join(run,top),{recursive:true})){
      const p=relative.replaceAll("\\","/");if(top.startsWith("runtime")?p.endsWith(".jsonl.zstd"):
        top==="desk"?/^\d+\/(?:isolation.json|pinned.bundle|reviewer.jsonl)$/.test(p):
        /^worker-[^/]+\/(?:home\/sessions\/.*\.jsonl\.zstd|result.bundle)$/.test(p))paths.push(top+"/"+p);
    }
  }
  return paths.filter(p=>existsSync(join(run,p)));
}
export function buildEvidence(run,mode) {
  const tmp=mkdtempSync(join(tmpdir(),"depot-attribution-"));
  try {
    for(const path of evidencePaths(run).filter(p=>p.startsWith("out/")||p.startsWith("runtime-"))){
      const dest=join(tmp,path);mkdirSync(dirname(dest),{recursive:true});cpSync(join(run,path),dest);
    }
    const latest=join(run,"desk/latest.zstd");
    if(existsSync(latest)){
      const bytes=readFileSync(latest),seed=readFileSync(history);
      assert(bytes.subarray(0,seed.length).equals(seed),"Previous maintenance session prefix changed");
      if(bytes.length>seed.length){
        const events=readStream(latest,digest(bytes)),boundary=readStream(history,digest(seed)).at(-1).seq;
        const dest=join(tmp,"runtime-REVIEW",streamPath);
        mkdirSync(dirname(dest),{recursive:true});
        writeFileSync(dest,Buffer.concat([events[0],...events.filter(e=>e.seq>boundary)].map(e=>zstdCompressSync(Buffer.from(JSON.stringify(e)+"\n")))));
      }
    }
    const ledger=readJson(join(tmp,"out/REVIEW/request-accounting.json"));
    const t=ledger.unresolvedRequests?stoppedEvidence(tmp,ledger):analyze(tmp,mode);
    for(const s of t.traces)if(s.session===maintainer)s.role="maintainer";
    for(const b of t.bindings)if(b.session===maintainer)b.role="maintainer";
    for(const b of t.bindings){
      const tr=t.traces.find(s=>s.session===b.session);
      const next=t.bindings.find(x=>x.session===b.session&&x.seq>b.seq);
      b.calls=tr.calls.filter(c=>c.seq>b.seq&&(!next||c.seq<next.seq)).map(c=>c.seq);
    }
    const principal=t.traces.find(s=>s.role==="principal");
    assert(principal.tools.includes("subagent")&&principal.tools.includes("workflow"));
    return t;
  }finally{rmSync(tmp,{recursive:true,force:true});}
}
